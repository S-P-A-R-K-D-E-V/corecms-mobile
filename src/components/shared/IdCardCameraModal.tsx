import { useEffect, useRef, useState } from 'react';
import { View, Modal, Image, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, Button, Pressable, Icon } from '../ui';
import { toast } from '../overlay';

type Props = {
  visible: boolean;
  /** Tiêu đề hiển thị trên thanh trên cùng, vd "Chụp CCCD mặt trước". */
  title: string;
  onClose: () => void;
  /** Nhận uri ảnh cục bộ vừa chụp (chưa upload). */
  onConfirm: (uri: string) => void;
};

/** Modal chụp ảnh CCCD trực tiếp bằng camera — cùng pattern camera với
 *  src/features/checkin/FaceCaptureModal.tsx nhưng không cần overlay
 *  GPS/timestamp, chỉ trả về ảnh thô để upload qua uploadMyIdCard(). */
export function IdCardCameraModal({ visible, title, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);

  // Xin quyền camera ngay khi mở modal; nếu bị từ chối thì đóng lại.
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

  function reset() {
    setCapturedUri(null);
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo) throw new Error('No photo');
      setCapturedUri(photo.uri);
    } catch {
      toast.error('Không thể chụp ảnh. Vui lòng thử lại.');
    }
  }

  function handleConfirm() {
    if (!capturedUri) return;
    onConfirm(capturedUri);
    reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  if (!permission?.granted) return null;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={handleClose}>
      <StatusBar barStyle="light-content" backgroundColor="#17131A" />
      <View className="flex-1 bg-black">
        {/* Top bar */}
        <View style={{ paddingTop: insets.top }} className="bg-[#17131A]">
          <View className="flex-row items-center px-2 py-1">
            <Pressable onPress={handleClose} className="w-11 h-11 items-center justify-center">
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Text className="text-white font-bold flex-1 ml-1">{title}</Text>
            {!capturedUri ? (
              <Pressable
                onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                className="w-11 h-11 items-center justify-center"
              >
                <Icon name="camera-flip" size={24} color="#FFFFFF" />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Camera / preview */}
        <View className="flex-1 bg-black">
          {!capturedUri ? (
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
          ) : (
            <Image source={{ uri: capturedUri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
          )}
        </View>

        {/* Actions */}
        <View className="bg-[#17131A]" style={{ paddingBottom: insets.bottom }}>
          <View className="p-5 gap-3">
            {!capturedUri ? (
              <Button action="neutral" className="bg-white" onPress={handleCapture} icon="camera">
                <Text className="text-ink font-bold">Chụp ảnh</Text>
              </Button>
            ) : (
              <>
                <Button variant="outline" action="neutral" className="border-white/40" onPress={reset} icon="camera-retake">
                  <Text className="text-white font-bold">Chụp lại</Text>
                </Button>
                <Button onPress={handleConfirm} icon="check-circle">
                  Dùng ảnh này
                </Button>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
