import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Modal, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { useSelfVerifyHub } from 'src/hooks/use-self-verify-hub';

const FRAME_INTERVAL_MS = 500;

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Live camera GIỐNG TRẢI NGHIỆM KIOSK (xem core-fe kiosk-checkin-view.tsx) thay cho luồng quay
 *  video 3s cũ — tự nhận diện liên tục qua /hubs/self-verify, hiện ngay khớp/không khớp + % tương
 *  đồng. KHÔNG tạo attendance log, thuần chẩn đoán tự phục vụ sau khi đăng ký. */
export function SelfVerifyModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const cameraRef = useRef<CameraView>(null);
  const busyRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);

  const { connectionState, tracks, verifyResult, error, clearError, sendFrame } = useSelfVerifyHub(visible);

  useEffect(() => {
    if (!visible) return;
    setCameraReady(false);
    if (!permission?.granted) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Vòng lặp lấy mẫu frame nền gửi qua SignalR — cùng cơ chế takePictureAsync đã dùng ổn định ở
  // FaceEnrollmentCameraModal, KHÔNG có API stream frame trực tiếp trong expo-camera.
  useEffect(() => {
    if (!visible || !permission?.granted || !cameraReady || connectionState !== 'connected') return undefined;

    const interval = setInterval(async () => {
      if (busyRef.current || !cameraRef.current) return;
      busyRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: true });
        if (photo?.base64) sendFrame(photo.base64);
      } catch {
        // Bỏ qua lỗi 1 lần chụp nền — thử lại ở nhịp kế tiếp.
      } finally {
        busyRef.current = false;
      }
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [visible, permission?.granted, cameraReady, connectionState, sendFrame]);

  const multiFace = tracks.length > 1;
  const soloTrack = tracks.length === 1 ? tracks[0] : undefined;
  const soloResult = soloTrack && verifyResult?.trackId === soloTrack.trackId ? verifyResult : undefined;

  const guideColor = multiFace
    ? '#FFAB00'
    : soloResult
      ? soloResult.matched
        ? '#22C55E'
        : '#EF4444'
      : soloTrack
        ? 'rgba(255,255,255,0.8)'
        : 'rgba(255,255,255,0.4)';

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!permission?.granted) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <StatusBar barStyle="light-content" backgroundColor="#17131A" />
      <View className="flex-1 bg-black">
        <View style={{ paddingTop: insets.top }} className="bg-[#17131A]">
          <View className="flex-row items-center px-2 py-1">
            <Pressable onPress={handleClose} className="w-11 h-11 items-center justify-center">
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Text className="text-white font-bold flex-1 ml-1">Kiểm tra so khớp khuôn mặt</Text>
          </View>
        </View>

        <View className="flex-1 bg-black">
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="front"
            onCameraReady={() => setCameraReady(true)}
          />

          {/* Khung oval canh mặt — đổi màu theo kết quả live (giống mã màu khung kiosk web: xanh
              lá = khớp, đỏ = không khớp, cam = nhiều mặt, xám = đang nhận diện). RN không có
              canvas overlay tiện lợi như web để vẽ bbox chính xác theo pixel — dùng khung oval cố
              định (đã có sẵn, quen thuộc với người dùng từ luồng đăng ký) thay vì tự làm bbox dễ
              lệch toạ độ mà không kiểm chứng được trên máy thật. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none" className="items-center justify-center">
            <View
              style={{
                width: 220,
                height: 280,
                borderRadius: 140,
                borderWidth: 3,
                borderColor: guideColor,
              }}
            />
          </View>

          {(!cameraReady || connectionState !== 'connected') && (
            <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/50 gap-2">
              <Spinner color="#FFFFFF" />
              <Text className="text-white text-[13px]">
                {!cameraReady ? 'Đang mở camera…' : connectionState === 'reconnecting' ? 'Đang kết nối lại…' : 'Đang kết nối…'}
              </Text>
            </View>
          )}
        </View>

        <View className="bg-[#17131A] p-5 gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
          {error ? (
            <Pressable onPress={clearError} className="bg-red-500/20 rounded-lg p-3">
              <Text className="text-red-400 text-[13px] text-center">{error}</Text>
            </Pressable>
          ) : multiFace ? (
            <Text className="text-amber-400 text-center text-[13px]">Chỉ 1 người trong khung hình một lúc.</Text>
          ) : !soloTrack ? (
            <Text className="text-white/60 text-center text-[13px]">Đưa khuôn mặt vào khung hình</Text>
          ) : !soloResult ? (
            <View className="flex-row items-center justify-center gap-2">
              <Spinner color="#FFFFFF" />
              <Text className="text-white/60 text-[13px]">Đang nhận diện…</Text>
            </View>
          ) : (
            <View className="items-center gap-1">
              <View className="flex-row items-center gap-2">
                <Icon
                  name={soloResult.matched ? 'check-decagram' : 'close-circle-outline'}
                  size={24}
                  tone={soloResult.matched ? 'success' : 'error'}
                />
                <Text variant="title" className="text-white">
                  {soloResult.matched ? 'Khớp!' : 'Không khớp'}
                  {user?.displayName ? ` — ${user.displayName}` : ''}
                </Text>
              </View>
              <Text className="text-white/70">Độ tương đồng: {Math.round(soloResult.similarity * 100)}%</Text>
            </View>
          )}
          <Button variant="outline" action="neutral" onPress={handleClose} icon="close">
            Đóng
          </Button>
        </View>
      </View>
    </Modal>
  );
}
