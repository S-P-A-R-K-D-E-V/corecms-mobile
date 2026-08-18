import { useEffect, useRef, useState } from 'react';
import { View, Modal, Image, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { toast } from 'src/components/overlay';

type Props = {
  visible: boolean;
  stepLabel: string;
  stepHint: string;
  stepIndex: number;
  totalSteps: number;
  /** Đang gọi enroll/quality để validate tấm vừa chụp. */
  validating: boolean;
  onClose: () => void;
  /** Nhận base64 (không kèm data: prefix) — cha tự validate + quyết định giữ hay chụp lại. */
  onCapture: (base64: string) => void;
};

/** Camera chụp từng bước enrollment — cùng pattern với FaceCaptureModal/IdCardCameraModal
 *  (Modal full-screen, expo-camera) nhưng giữ camera mở xuyên suốt cả 6 bước (không đóng/mở
 *  lại modal mỗi bước), có khung oval canh mặt + text hướng dẫn theo bước hiện tại. */
export function FaceEnrollmentCameraModal({
  visible, stepLabel, stepHint, stepIndex, totalSteps, validating, onClose, onCapture,
}: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);

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

  // Reset preview mỗi khi chuyển sang bước mới (chụp được chấp nhận) — camera vẫn mở nguyên,
  // chỉ preview ảnh cũ bị xoá đi.
  useEffect(() => {
    setCapturedUri(null);
    setCapturedBase64(null);
  }, [stepIndex]);

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85, base64: true });
      if (!photo?.base64) throw new Error('No photo');
      setCapturedUri(photo.uri);
      setCapturedBase64(photo.base64);
    } catch {
      toast.error('Không thể chụp ảnh. Vui lòng thử lại.');
    }
  }

  function handleRetake() {
    setCapturedUri(null);
    setCapturedBase64(null);
  }

  function handleUseThisPhoto() {
    if (!capturedBase64) return;
    onCapture(capturedBase64);
  }

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
          <View className="px-4 pb-2">
            <Text className="text-white/80 text-[13px]">{stepHint}</Text>
          </View>
        </View>

        {/* Camera / preview */}
        <View className="flex-1 bg-black">
          {!capturedUri ? (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
              {/* Khung oval canh mặt */}
              <View style={StyleSheet.absoluteFill} pointerEvents="none" className="items-center justify-center">
                <View
                  style={{
                    width: 220,
                    height: 280,
                    borderRadius: 140,
                    borderWidth: 3,
                    borderColor: 'rgba(255,255,255,0.8)',
                  }}
                />
              </View>
            </>
          ) : (
            <Image
              source={{ uri: capturedUri }}
              style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}
              resizeMode="cover"
            />
          )}
        </View>

        {/* Actions */}
        <View className="bg-[#17131A]" style={{ paddingBottom: insets.bottom }}>
          <View className="p-5 gap-3">
            {!capturedUri ? (
              <Button action="neutral" className="bg-white" onPress={handleCapture} icon="camera">
                <Text className="text-ink font-bold">Chụp</Text>
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  action="neutral"
                  className="border-white/40"
                  onPress={handleRetake}
                  disabled={validating}
                  icon="camera-retake"
                >
                  <Text className="text-white font-bold">Chụp lại</Text>
                </Button>
                <Button loading={validating} onPress={handleUseThisPhoto} icon="check-circle">
                  Dùng ảnh này
                </Button>
              </>
            )}
            {validating ? (
              <View className="flex-row items-center justify-center gap-2">
                <Spinner color="#FFFFFF" />
                <Text className="text-white/70 text-[12px]">Đang kiểm tra ảnh…</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
