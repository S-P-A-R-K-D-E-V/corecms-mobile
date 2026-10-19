import { useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, StatusBar, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { faceColor, faceHint, faceStatus, trackRectInView, type Size } from 'src/features/checkin/face-stream';
import { FaceBox, useFrameCapture } from 'src/features/checkin/live-face';
import { useFaceStream } from 'src/features/checkin/useFaceStream';

// ----------------------------------------------------------------------
// Kiểm tra so khớp khuôn mặt — cùng giao diện quét trực tiếp như check-in (khung bám khuôn mặt, ~4 hình/giây qua
// /hubs/self-verify, máy chủ kiểm tra người thật rồi so 1:1 với khuôn mặt đã đăng ký) nhưng KHÔNG ghi chấm công: chỉ
// hiện khớp / không khớp + % để nhân viên tự kiểm tra, không khớp thì đăng ký lại.
// ----------------------------------------------------------------------

const FRAME_INTERVAL_MS = 200;
/** Ngưỡng nhận diện (KioskSettings.SimilarityThreshold của máy chủ) — để giải thích con số %. */
const MATCH_THRESHOLD_PERCENT = 55;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Không khớp → mời đăng ký lại (màn đăng ký khuôn mặt truyền vào). */
  onReenroll?: () => void;
};

export function SelfVerifyModal({ visible, onClose, onReenroll }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const portrait = screenH >= screenW;
  const { user } = useAuthContext();
  const cameraRef = useRef<CameraView>(null);
  const busyRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [view, setView] = useState<Size | null>(null);
  const [session, setSession] = useState(0);
  const frames = useFrameCapture(cameraRef, portrait);

  const stream = useFaceStream(visible && !!permission?.granted, session);
  const status = faceStatus(stream.tracks, stream.verifyResult);
  const notEnrolled = !!stream.error && /chưa đăng ký khuôn mặt/i.test(stream.error);

  useEffect(() => {
    if (!visible) return;
    setCameraReady(false);
    frames.reset();
    if (!permission?.granted) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function onCameraReady() {
    setCameraReady(true);
    await frames.pickSize();
  }

  // Gửi khung hình liên tục — đã có kết quả của khuôn mặt hiện tại thì vẫn gửi để khung bám theo (máy chủ chỉ so mỗi
  // khuôn mặt một lần / kết nối; "Quét lại" mở kết nối mới để so lại).
  useEffect(() => {
    if (!visible || !cameraReady || stream.state !== 'connected' || notEnrolled) return undefined;
    const timer = setInterval(async () => {
      if (busyRef.current || !cameraRef.current) return;
      busyRef.current = true;
      try {
        const base64 = await frames.capture();
        if (base64) stream.sendFrame(base64);
      } catch {
        // Bỏ qua một khung hỏng, lần sau chụp lại.
      } finally {
        busyRef.current = false;
      }
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, cameraReady, stream.state, notEnrolled, frames.capture]);

  function rescan() {
    stream.resetVerify();
    setSession((n) => n + 1);
  }

  if (!permission?.granted) return null;

  const camW = Math.min(screenW, 560);
  const camH = Math.round((camW * 4) / 3);
  const soloTrack = stream.tracks.length === 1 ? stream.tracks[0] : undefined;
  const frame = frames.frame;
  const boxes = frame && view ? stream.tracks.map((t) => ({ id: t.trackId, rect: trackRectInView(t.bbox, frame, view, true) })) : [];
  const color = faceColor(status);
  const percent = stream.verifyResult ? Math.round(stream.verifyResult.similarity * 100) : 0;
  const label =
    status === 'matched'
      ? `${user?.firstName ?? 'Bạn'} · ${percent}%`
      : status === 'mismatch'
        ? `Không khớp · ${percent}%`
        : faceHint(status);
  const decided = status === 'matched' || status === 'mismatch';

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#17131A" />
      <View className="flex-1 bg-black">
        <View style={{ paddingTop: insets.top }} className="bg-[#17131A]">
          <View className="flex-row items-center px-2 py-1">
            <Pressable onPress={onClose} className="w-11 h-11 items-center justify-center">
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Text className="text-white font-bold flex-1 ml-1">Kiểm tra so khớp khuôn mặt</Text>
          </View>
        </View>

        <View className="flex-1 bg-black items-center justify-center">
          <View
            style={{ width: camW, height: camH, overflow: 'hidden', borderRadius: 20 }}
            onLayout={(e: LayoutChangeEvent) => setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
          >
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="front"
              ratio="4:3"
              pictureSize={frames.pictureSize}
              animateShutter={false}
              onCameraReady={onCameraReady}
            />
            {boxes.map((b) => (
              <FaceBox
                key={b.id}
                left={b.rect.left}
                top={b.rect.top}
                width={b.rect.width}
                height={b.rect.height}
                color={soloTrack ? color : faceColor('multi')}
                label={soloTrack ? label : faceHint('multi')}
              />
            ))}
            {!cameraReady || stream.state !== 'connected' ? (
              <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/50 gap-2">
                <Spinner color="#FFFFFF" />
                <Text className="text-white text-[13px]">
                  {!cameraReady ? 'Đang mở camera…' : stream.state === 'failed' ? 'Không kết nối được nhận diện' : 'Đang kết nối…'}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="bg-[#17131A] p-5 gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
          {notEnrolled ? (
            <Text className="text-amber-300 text-center text-[13px]">{stream.error}</Text>
          ) : decided ? (
            <View className="items-center gap-1">
              <View className="flex-row items-center gap-2">
                <Icon name={status === 'matched' ? 'check-decagram' : 'close-circle-outline'} size={26} color={color} />
                <Text variant="title" className="text-white">
                  {status === 'matched' ? `Khớp · ${percent}%` : `Không khớp · ${percent}%`}
                </Text>
              </View>
              <Text className="text-white/60 text-[12px] text-center">
                {status === 'matched'
                  ? `Từ ${MATCH_THRESHOLD_PERCENT}% trở lên là nhận ra bạn — chấm công bằng khuôn mặt sẽ chạy bình thường.`
                  : `Dưới ${MATCH_THRESHOLD_PERCENT}% — thử chỗ đủ sáng, nhìn thẳng; vẫn không khớp thì đăng ký lại khuôn mặt.`}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center justify-center gap-2">
              {status === 'spoof' ? <Icon name="alert-circle" size={18} color={color} /> : <Spinner color="#FFFFFF" />}
              <Text className="text-white/80 text-[13px] flex-shrink">
                {stream.state === 'failed' ? 'Mất kết nối — bấm Quét lại.' : faceHint(status)}
              </Text>
            </View>
          )}

          {decided || status === 'spoof' || stream.state === 'failed' ? (
            <Button variant="outline" action="neutral" icon="refresh" onPress={rescan}>
              Quét lại
            </Button>
          ) : null}
          {(status === 'mismatch' || notEnrolled) && onReenroll ? (
            <Button icon="camera-retake" onPress={() => { onClose(); onReenroll(); }}>
              {notEnrolled ? 'Đăng ký khuôn mặt' : 'Đăng ký lại khuôn mặt'}
            </Button>
          ) : null}
          <Button variant="outline" action="neutral" onPress={onClose} icon="close">
            Đóng
          </Button>
        </View>
      </View>
    </Modal>
  );
}
