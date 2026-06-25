import { useRef, useState } from 'react';
import { View, Modal, Image, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import dayjs from 'dayjs';

import { Text, Button, Pressable, Icon } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import type { Coords } from './utils';

type Props = {
  visible: boolean;
  coords: Coords | null;
  loading: boolean;
  onClose: () => void;
  /** Receives the stamped photo as base64 (no data: prefix) + capture time. */
  onConfirm: (base64: string, captureTime: Date) => void;
};

/** Full-screen face capture with a timestamp + GPS overlay burned into the photo. */
export function FaceCaptureModal({ visible, coords, loading, onClose, onConfirm }: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const previewRef = useRef<ViewShotRef>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [captureTime, setCaptureTime] = useState<Date>(new Date());

  function reset() {
    setCapturedUri(null);
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo) throw new Error('No photo');
      setCapturedUri(photo.uri);
      setCaptureTime(new Date());
    } catch {
      toast.error('Không thể chụp ảnh. Vui lòng thử lại.');
    }
  }

  async function handleConfirm() {
    if (!capturedUri || !previewRef.current) return;
    const base64 = await previewRef.current.capture();
    onConfirm(base64, captureTime);
  }

  function handleClose() {
    reset();
    onClose();
  }

  const overlay = (time: Date) => (
    <View style={ov.overlay}>
      <Text className="text-white text-xs">⏰ {dayjs(time).format('HH:mm  DD/MM/YYYY')}</Text>
      {coords ? (
        <Text className="text-white text-xs">
          📍 {coords.latitude.toFixed(5)}, {coords.longitude.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );

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
            <Text className="text-white font-bold flex-1 ml-1">
              {capturedUri ? t('checkin.confirmPhoto') : t('checkin.captureFace')}
            </Text>
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
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
              {/* Face alignment guide */}
              <View pointerEvents="none" style={StyleSheet.absoluteFill} className="items-center justify-center">
                <View
                  style={{ width: 220, height: 280, borderRadius: 140, borderWidth: 3, borderColor: 'rgba(255,255,255,0.6)' }}
                />
                <Text className="text-white/80 mt-5 text-[13px] font-semibold">Đưa khuôn mặt vào khung</Text>
              </View>
              {overlay(new Date())}
            </>
          ) : (
            <ViewShot
              ref={previewRef}
              style={StyleSheet.absoluteFill}
              options={{ format: 'jpg', quality: 0.85, result: 'base64' }}
            >
              <Image
                source={{ uri: capturedUri }}
                style={[StyleSheet.absoluteFill, facing === 'front' && { transform: [{ scaleX: -1 }] }]}
                resizeMode="cover"
              />
              {overlay(captureTime)}
            </ViewShot>
          )}
        </View>

        {/* Actions */}
        <View className="bg-[#17131A]" style={{ paddingBottom: insets.bottom }}>
          <View className="p-5 gap-3">
            {!capturedUri ? (
              <Button action="neutral" className="bg-white" onPress={handleCapture} icon="camera">
                <Text className="text-ink font-bold">{t('checkin.capture')}</Text>
              </Button>
            ) : (
              <>
                <Button variant="outline" action="neutral" className="border-white/40" onPress={reset} icon="camera-retake">
                  <Text className="text-white font-bold">{t('checkin.retake')}</Text>
                </Button>
                <Button loading={loading} onPress={handleConfirm} icon="check-circle">
                  {t('checkin.confirmCheckIn')}
                </Button>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const ov = StyleSheet.create({
  overlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 4,
  },
});
