import { useEffect, useRef } from 'react';
import { View, Modal, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { toast } from 'src/components/overlay';

type Props = {
  visible: boolean;
  stepLabel: string;
  stepIndex: number;
  totalSteps: number;
  /** Đã đạt bước hiện tại — dừng lấy mẫu, hiện dấu ✓ trong lúc chuyển bước. */
  stepPassed: boolean;
  /** Thông báo lý do chưa đạt (từ lần lấy mẫu gần nhất) hoặc gợi ý mặc định của bước. */
  hint: string;
  onClose: () => void;
  /** Gọi liên tục với mỗi frame lấy mẫu nền — cha tự validate (base64) + quyết định giữ hay
   *  bỏ qua, KHÔNG cần người dùng bấm chụp. `uri` (file cache local) dùng để upload thẳng lên
   *  R2 lúc submit — tránh phải encode lại base64 -> Blob (không ổn định trên RN). */
  onFrame: (photo: { base64: string; uri: string }) => void;
};

const POLL_INTERVAL_MS = 900;

/** Camera enrollment tự động — mở liên tục xuyên suốt 6 bước, tự lấy mẫu frame nền gửi cho
 *  cha validate (KHÔNG có nút "Chụp"/"Dùng ảnh này" — khác thiết kế chụp-từng-tấm trước đây). */
export function FaceEnrollmentCameraModal({
  visible, stepLabel, stepIndex, totalSteps, stepPassed, hint, onClose, onFrame,
}: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const busyRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (!visible || permission?.granted) return;
    requestPermission().then((res) => {
      if (!res.granted) {
        toast.error('Vui lòng cấp quyền truy cập camera.', 'Cần quyền truy cập');
        onClose();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || !permission?.granted || stepPassed) return undefined;

    const interval = setInterval(async () => {
      if (busyRef.current || !cameraRef.current) return;
      busyRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: true });
        if (photo?.base64 && photo.uri) onFrame({ base64: photo.base64, uri: photo.uri });
      } catch {
        // Bỏ qua lỗi 1 lần chụp nền — thử lại ở nhịp kế tiếp.
      } finally {
        busyRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [visible, permission?.granted, stepPassed, onFrame]);

  if (!permission?.granted) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor="#17131A" />
      <View className="flex-1 bg-black">
        {/* Top bar */}
        <View style={{ paddingTop: insets.top }} className="bg-[#17131A]">
          <View className="flex-row items-center px-2 py-1">
            <Pressable onPress={onClose} className="w-11 h-11 items-center justify-center">
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Text className="text-white font-bold flex-1 ml-1">
              Bước {stepIndex + 1}/{totalSteps}: {stepLabel}
            </Text>
          </View>
        </View>

        {/* Camera */}
        <View className="flex-1 bg-black">
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
          {/* Khung oval canh mặt */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none" className="items-center justify-center">
            <View
              style={{
                width: 220,
                height: 280,
                borderRadius: 140,
                borderWidth: 3,
                borderColor: stepPassed ? '#22C55E' : 'rgba(255,255,255,0.8)',
              }}
              className="items-center justify-center"
            >
              {stepPassed ? <Icon name="check-bold" size={64} color="#22C55E" /> : null}
            </View>
          </View>
        </View>

        {/* Hint bar */}
        <View className="bg-[#17131A]" style={{ paddingBottom: insets.bottom }}>
          <View className="px-4 py-3 flex-row items-center gap-2">
            {!stepPassed ? <Spinner color="#FFFFFF" /> : null}
            <Text className="text-white text-[13px] flex-1">
              {stepPassed ? '✓ Đạt! Chuyển bước tiếp theo…' : hint}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
