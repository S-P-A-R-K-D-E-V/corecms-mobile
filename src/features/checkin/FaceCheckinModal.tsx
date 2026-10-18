import { useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, StatusBar, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { checkEnrollQuality } from 'src/api/faceEnrollment';
import { smartCheckInFace, smartCheckOutFace, checkInFace, checkinFace } from 'src/api/attendance';
import { useAuthContext } from 'src/auth/auth-context';
import { getImageManipulator } from 'src/features/chat/attachment-prepare';
import type { IEnrollQualityResponse } from 'src/types/corecms-api';
import type { Coords } from './utils';
import {
  faceColor,
  faceHint,
  faceStatus,
  orientedFrameSize,
  pickPictureSize,
  trackRectInView,
  type Size,
} from './face-stream';
import { useFaceStream } from './useFaceStream';

// ----------------------------------------------------------------------
// Check-in / check-out bằng khuôn mặt — tự phát hiện khuôn mặt như kiosk trên web, không có khung tròn hay nút chụp:
// camera mở là gửi khung hình (~4 hình/giây) qua /hubs/self-verify, vẽ khung bám theo khuôn mặt, máy chủ tự kiểm tra
// người thật + so 1:1 với khuôn mặt đã đăng ký. Khớp → tự gửi đúng khung hình đó tới smart-check-in-face /
// smart-check-out-face / check-in-face (ngoài giờ) — máy chủ so lại lần nữa rồi mới ghi chấm công.
// Không kết nối được hub (mạng chặn WebSocket…) → cách cũ: cứ ~1 giây chụp một ảnh, đủ "nhìn thẳng" thì gửi.
// ----------------------------------------------------------------------

/** Nhịp gửi khung hình khi quét trực tiếp (~4–5 hình/giây, thực tế chậm hơn nếu máy chụp chậm). */
const FRAME_INTERVAL_MS = 200;
/** Khung hình lớn hơn thế này (máy bỏ qua cỡ ảnh nhỏ đã chọn, vd iPhone) → thu nhỏ còn cạnh dài 640 px trước khi gửi. */
const MAX_FRAME_CHARS = 160_000;
const SHRINK_LONG_SIDE = 640;
const FALLBACK_INTERVAL_MS = 900;
/** Đã gửi khung hình mà máy chủ chưa từng thấy khuôn mặt nào trong chừng này → chuyển sang cách cũ (chụp ~1 giây/lần). */
const NO_FACE_FALLBACK_MS = 10_000;
/** Quá lâu chưa nhận ra → dừng, mời thử lại (đỡ tốn pin / dữ liệu). */
const SCAN_TIMEOUT_MS = 45_000;
const YAW_STRAIGHT_MAX = 0.08;
const PITCH_STRAIGHT_MAX = 0.08;
const MIN_QUALITY = 0.55; // khớp Settings.QUALITY_THRESHOLD face-tracking-service

function validateStraight(q: IEnrollQualityResponse): string | null {
  if (q.qualityScore < MIN_QUALITY) return 'Ảnh chưa đủ rõ — di chuyển tới nơi đủ sáng, giữ máy ổn định.';
  if (Math.abs(q.yaw) > YAW_STRAIGHT_MAX || Math.abs(q.pitch) > PITCH_STRAIGHT_MAX) return 'Vui lòng nhìn thẳng vào camera.';
  return null;
}

function isNotEnrolledError(err: any): boolean {
  const errorCode = err?.errors && typeof err.errors === 'object' ? Object.keys(err.errors)[0] : null;
  return errorCode === 'FaceTracking.NoFaceEmbedding';
}

type Phase = 'opening' | 'scanning' | 'submitting' | 'success' | 'error';

/**
 * Thu nhỏ khung hình còn cạnh dài 640 px, JPEG 0.6 (≈40–60 KB). Bộ nén xoay ảnh theo EXIF nên width / height trả về đã
 * đúng chiều. Bản app chưa có bộ nén → null (gửi ảnh gốc, máy chủ vẫn nhận tới 5 MB).
 */
async function shrinkFrame(uri: string): Promise<{ base64: string; width: number; height: number } | null> {
  const M = getImageManipulator();
  if (!M) return null;
  const owned: { release(): void }[] = [];
  try {
    const ctx = M.ImageManipulator.manipulate(uri);
    owned.push(ctx);
    const original = await ctx.renderAsync();
    owned.push(original);
    const scale = Math.min(1, SHRINK_LONG_SIDE / Math.max(original.width, original.height));
    const resized = M.ImageManipulator.manipulate(original).resize({
      width: Math.round(original.width * scale),
      height: Math.round(original.height * scale),
    });
    owned.push(resized);
    const out = await resized.renderAsync();
    owned.push(out);
    const saved = await out.saveAsync({ compress: 0.6, format: M.SaveFormat.JPEG, base64: true });
    return saved.base64 ? { base64: saved.base64, width: out.width, height: out.height } : null;
  } catch {
    return null;
  } finally {
    for (const o of owned) {
      try {
        o.release();
      } catch {}
    }
  }
}

type Props = {
  visible: boolean;
  mode: 'checkin' | 'checkout' | 'overtime';
  coords: Coords | null;
  onClose: () => void;
  /** Gọi khi check-in/out thành công — cha tự refetch(). */
  onSuccess: () => void;
};

/** Khung bám khuôn mặt — trượt mượt giữa các lần cập nhật (~4 lần/giây) như kiosk. */
function FaceBox({ left, top, width, height, color, label }: { left: number; top: number; width: number; height: number; color: string; label: string }) {
  const x = useSharedValue(left);
  const y = useSharedValue(top);
  const w = useSharedValue(width);
  const h = useSharedValue(height);
  useEffect(() => {
    const t = { duration: 120 };
    x.value = withTiming(left, t);
    y.value = withTiming(top, t);
    w.value = withTiming(width, t);
    h.value = withTiming(height, t);
  }, [left, top, width, height, x, y, w, h]);
  const style = useAnimatedStyle(() => ({ left: x.value, top: y.value, width: w.value, height: h.value }));

  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 3, borderRadius: 18, borderColor: color }, style]}>
      <View style={{ position: 'absolute', top: -30, left: -3, backgroundColor: color, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
        <Text className="text-white font-bold text-[12px]" numberOfLines={1}>{label}</Text>
      </View>
    </Animated.View>
  );
}

export function FaceCheckinModal({ visible, mode, coords, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const portrait = screenH >= screenW;
  const { user } = useAuthContext();
  const cameraRef = useRef<CameraView>(null);
  const busyRef = useRef(false);
  const lastFrameRef = useRef<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('opening');
  const [hint, setHint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);
  const [frame, setFrame] = useState<Size | null>(null);
  const [view, setView] = useState<Size | null>(null);
  const [session, setSession] = useState(0);
  const [noFaceFallback, setNoFaceFallback] = useState(false);
  const firstFrameAtRef = useRef<number | null>(null);

  const scanning = visible && (phase === 'scanning' || phase === 'submitting');
  const stream = useFaceStream(scanning, session);
  const fallback = stream.state === 'failed' || noFaceFallback;
  const status = faceStatus(stream.tracks, stream.verifyResult);

  useEffect(() => {
    if (!visible) return;
    setPhase('opening');
    setHint(null);
    setErrorMsg(null);
    setNotEnrolled(false);
    setCameraReady(false);
    setFrame(null);
    setNoFaceFallback(false);
    firstFrameAtRef.current = null;
    lastFrameRef.current = null;
    if (!permission?.granted) {
      requestPermission().then((res) => {
        if (res.granted) setPhase('scanning');
      });
    } else {
      setPhase('scanning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function onCameraReady() {
    setCameraReady(true);
    try {
      const sizes = (await cameraRef.current?.getAvailablePictureSizesAsync()) ?? [];
      const picked = pickPictureSize(sizes);
      if (picked) setPictureSize(picked);
    } catch {
      // Không lấy được danh sách cỡ ảnh → dùng mặc định (ảnh nặng hơn, vẫn chạy).
    }
  }

  async function capture(): Promise<string | null> {
    const photo = await cameraRef.current?.takePictureAsync({
      quality: 0.5,
      base64: true,
      skipProcessing: true,
      shutterSound: false,
    });
    if (!photo?.base64) return null;
    if (photo.base64.length > MAX_FRAME_CHARS) {
      const shrunk = await shrinkFrame(photo.uri);
      if (shrunk) {
        setFrame({ width: shrunk.width, height: shrunk.height });
        return shrunk.base64;
      }
    }
    const fromPicture = pictureSize ? /^(\d+)x(\d+)$/.exec(pictureSize) : null;
    const rawW = photo.width > 0 ? photo.width : fromPicture ? Number(fromPicture[1]) : 480;
    const rawH = photo.height > 0 ? photo.height : fromPicture ? Number(fromPicture[2]) : 640;
    setFrame(orientedFrameSize(rawW, rawH, portrait));
    return photo.base64;
  }

  async function handleSubmit(imageBase64: string) {
    setPhase('submitting');
    try {
      const payload = { imageBase64, latitude: coords?.latitude, longitude: coords?.longitude, accuracy: coords?.accuracy };
      // faceMatchConfidence (%) do máy chủ tính khi so — đưa vào tin nhóm chấm công.
      let matchConfidence: number | undefined;
      if (mode === 'checkin') matchConfidence = (await smartCheckInFace(payload)).faceMatchConfidence;
      else if (mode === 'checkout') matchConfidence = (await smartCheckOutFace(payload))[0]?.faceMatchConfidence;
      else matchConfidence = (await checkInFace({ ...payload, isOvertime: true })).faceMatchConfidence;
      // Ảnh vào nhóm chấm công — không chặn kết quả nếu lỗi (chỉ là thông báo phụ).
      checkinFace({
        candidateName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Unknown',
        imageBase64: `data:image/jpeg;base64,${imageBase64}`,
        lat: coords?.latitude,
        lng: coords?.longitude,
        time: new Date().toISOString(),
        matchConfidence,
      }).catch(() => {});
      setPhase('success');
      onSuccess();
      // Tự đóng sau khi cha đã hiện thông báo thành công.
      setTimeout(onClose, 700);
    } catch (err) {
      setErrorMsg(extractApiError(err));
      setNotEnrolled(isNotEnrolledError(err));
      setPhase('error');
    }
  }

  // ── Quét trực tiếp: gửi khung hình liên tục, khung khuôn mặt bám theo kết quả máy chủ. ──
  useEffect(() => {
    if (phase !== 'scanning' || !cameraReady || fallback || stream.state !== 'connected') return undefined;
    const timer = setInterval(async () => {
      if (busyRef.current || !cameraRef.current) return;
      busyRef.current = true;
      try {
        const base64 = await capture();
        if (base64 && stream.sendFrame(base64)) {
          lastFrameRef.current = base64;
          if (firstFrameAtRef.current === null) firstFrameAtRef.current = Date.now();
        }
      } catch {
        // Bỏ qua một khung hỏng, lần sau chụp lại.
      } finally {
        busyRef.current = false;
      }
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraReady, fallback, stream.state, pictureSize]);

  // Đã gửi khung hình ~10 giây mà máy chủ chưa thấy khuôn mặt nào (ảnh lỗi chiều / mạng chậm…) → cách cũ, khỏi kẹt.
  const seenFaceRef = useRef(false);
  if (stream.tracks.length > 0) seenFaceRef.current = true;
  useEffect(() => {
    if (phase !== 'scanning' || fallback || stream.state !== 'connected') return undefined;
    const timer = setInterval(() => {
      const first = firstFrameAtRef.current;
      if (!seenFaceRef.current && first !== null && Date.now() - first > NO_FACE_FALLBACK_MS) setNoFaceFallback(true);
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, fallback, stream.state]);

  // Máy chủ báo khớp đúng khuôn mặt duy nhất trong khung → tự chấm công bằng khung hình vừa gửi.
  useEffect(() => {
    if (phase === 'scanning' && status === 'matched' && lastFrameRef.current) void handleSubmit(lastFrameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, status]);

  // ── Cách cũ khi không có hub: ~1 giây chụp một ảnh, đủ "nhìn thẳng" thì gửi luôn. ──
  useEffect(() => {
    if (phase !== 'scanning' || !cameraReady || !fallback) return undefined;
    const timer = setInterval(async () => {
      if (busyRef.current || !cameraRef.current) return;
      busyRef.current = true;
      try {
        const base64 = await capture();
        if (!base64) return;
        const error = validateStraight(await checkEnrollQuality(base64));
        if (error) {
          setHint(error);
          return;
        }
        setHint(null);
        await handleSubmit(base64);
      } catch (err) {
        setHint(extractApiError(err));
      } finally {
        busyRef.current = false;
      }
    }, FALLBACK_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, cameraReady, fallback, pictureSize]);

  // Quét quá lâu không nhận ra → dừng, mời thử lại.
  useEffect(() => {
    if (phase !== 'scanning') return undefined;
    const timer = setTimeout(() => {
      setErrorMsg('Chưa nhận ra khuôn mặt. Đứng nơi đủ sáng, nhìn thẳng vào camera rồi thử lại.');
      setPhase('error');
    }, SCAN_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [phase, session]);

  // Máy chủ báo chưa đăng ký khuôn mặt qua hub.
  useEffect(() => {
    if (stream.error && /chưa đăng ký khuôn mặt/i.test(stream.error)) {
      setNotEnrolled(true);
      setErrorMsg(stream.error);
      setPhase('error');
    }
  }, [stream.error]);

  function handleRetry() {
    setErrorMsg(null);
    setNotEnrolled(false);
    setHint(null);
    lastFrameRef.current = null;
    firstFrameAtRef.current = null;
    seenFaceRef.current = false;
    setNoFaceFallback(false);
    stream.resetVerify();
    setSession((n) => n + 1);
    setPhase('scanning');
  }

  if (!permission?.granted) return null;

  const title =
    mode === 'checkout' ? 'Check-out bằng khuôn mặt' : mode === 'overtime' ? 'Check-in ngoài giờ bằng khuôn mặt' : 'Check-in bằng khuôn mặt';

  // Khung xem trước 3:4 (cùng tỉ lệ ảnh gửi đi) để khung khuôn mặt khớp đúng chỗ.
  const camW = Math.min(screenW, 560);
  const camH = Math.round((camW * 4) / 3);
  const soloTrack = stream.tracks.length === 1 ? stream.tracks[0] : undefined;
  const boxes =
    frame && view && !fallback
      ? stream.tracks.map((t) => ({ id: t.trackId, rect: trackRectInView(t.bbox, frame, view, true) }))
      : [];
  const color = faceColor(status);
  const percent = stream.verifyResult ? Math.round(stream.verifyResult.similarity * 100) : 0;
  const label =
    status === 'matched'
      ? `${user?.firstName ?? 'Bạn'} · ${percent}%`
      : status === 'mismatch'
        ? `Không khớp · ${percent}%`
        : faceHint(status);
  const statusText = fallback
    ? hint ?? 'Giữ khuôn mặt trước camera, nhìn thẳng…'
    : stream.state !== 'connected'
      ? 'Đang kết nối nhận diện khuôn mặt…'
      : faceHint(status);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#17131A" />
      <View className="flex-1 bg-black">
        <View style={{ paddingTop: insets.top }} className="bg-[#17131A]">
          <View className="flex-row items-center px-2 py-1">
            <Pressable onPress={onClose} className="w-11 h-11 items-center justify-center">
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Text className="text-white font-bold flex-1 ml-1">{title}</Text>
          </View>
        </View>

        <View className="flex-1 bg-black items-center justify-center">
          {phase === 'success' || phase === 'error' ? (
            <View className="items-center justify-center gap-3 px-8">
              {phase === 'error' ? (
                <>
                  <Icon name="alert-circle-outline" size={56} tone="error" />
                  <Text className="text-white text-center">{errorMsg}</Text>
                </>
              ) : (
                <>
                  <Icon name="check-decagram" size={56} tone="success" />
                  <Text variant="title" className="text-white">
                    {mode === 'checkout' ? 'Check-out thành công!' : 'Check-in thành công!'}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <View
              style={{ width: camW, height: camH, overflow: 'hidden', borderRadius: 20 }}
              onLayout={(e: LayoutChangeEvent) => setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
            >
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="front"
                ratio="4:3"
                pictureSize={pictureSize}
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
              {phase === 'submitting' ? (
                <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/50 gap-2">
                  <Spinner color="#FFFFFF" />
                  <Text className="text-white text-[13px]">{mode === 'checkout' ? 'Đang check-out…' : 'Đang check-in…'}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View className="bg-[#17131A]" style={{ paddingBottom: insets.bottom + 16 }}>
          {phase === 'scanning' || phase === 'opening' ? (
            <View className="px-4 py-3 flex-row items-center gap-2">
              {status === 'mismatch' || status === 'spoof' ? (
                <Icon name="alert-circle" size={18} color={color} />
              ) : (
                <Spinner color="#FFFFFF" />
              )}
              <Text className="text-white text-[13px] flex-1">{statusText}</Text>
            </View>
          ) : null}
          {phase === 'scanning' && (status === 'mismatch' || status === 'spoof') ? (
            <View className="px-4 pb-1">
              <Button size="sm" variant="outline" action="neutral" icon="refresh" onPress={handleRetry}>
                Quét lại
              </Button>
            </View>
          ) : null}
          {phase === 'error' ? (
            <View className="p-5 gap-3">
              {notEnrolled ? (
                <Button icon="face-recognition" onPress={() => { onClose(); router.push('/face-enrollment'); }}>
                  Đăng ký khuôn mặt ngay
                </Button>
              ) : (
                <Button icon="camera-retake" onPress={handleRetry}>Thử lại</Button>
              )}
              <Button variant="outline" action="neutral" onPress={onClose}>Đóng</Button>
            </View>
          ) : null}
          {phase === 'success' ? (
            <View className="p-5">
              <Button onPress={onClose}>Đóng</Button>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
