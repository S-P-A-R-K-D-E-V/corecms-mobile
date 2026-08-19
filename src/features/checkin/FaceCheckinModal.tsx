import { useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { smartCheckInFace, smartCheckOutFace } from 'src/api/attendance';
import type { Coords } from './utils';

const RECORD_DURATION_SEC = 3;

type Phase = 'idle' | 'recording' | 'submitting' | 'success' | 'error';

type Props = {
  visible: boolean;
  mode: 'checkin' | 'checkout';
  coords: Coords | null;
  onClose: () => void;
  /** Gọi khi check-in/out thành công — cha tự refetch(). */
  onSuccess: () => void;
};

/** Check-in/check-out bằng khuôn mặt (mới) — chạy SONG SONG với luồng chụp ảnh cũ
 *  (FaceCaptureModal trong CheckinScreen.tsx), không thay thế. Khác biệt duy nhất: quay 1
 *  video ngắn thay vì chụp ảnh, BE tự verify qua face-tracking-service (POST
 *  /attendance/smart-check-in-face, -out-face) — verify là best-effort, KHÔNG chặn chấm công
 *  nếu fail/service lỗi, nên modal này không cần màn "thử lại nếu không khớp" như
 *  SelfVerifyModal — quay xong là submit thẳng. */
export function FaceCheckinModal({ visible, mode, coords, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPhase('idle');
    setErrorMsg(null);
    if (!permission?.granted) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function handleRecord() {
    if (!cameraRef.current) return;
    setPhase('recording');
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: RECORD_DURATION_SEC });
      if (!video?.uri) throw new Error('Không quay được video');

      setPhase('submitting');
      const base64 = await FileSystem.readAsStringAsync(video.uri, { encoding: 'base64' });
      const payload = {
        videoBase64: base64,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        accuracy: coords?.accuracy,
      };
      if (mode === 'checkin') {
        await smartCheckInFace(payload);
      } else {
        await smartCheckOutFace(payload);
      }
      setPhase('success');
      onSuccess();
    } catch (err) {
      setErrorMsg(extractApiError(err));
      setPhase('error');
    }
  }

  function handleRetry() {
    setErrorMsg(null);
    setPhase('idle');
  }

  if (!permission?.granted) return null;

  const title = mode === 'checkin' ? 'Check-in bằng khuôn mặt' : 'Check-out bằng khuôn mặt';

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

        <View className="flex-1 bg-black">
          {phase === 'success' || phase === 'error' ? (
            <View className="flex-1 items-center justify-center gap-3 px-8">
              {phase === 'error' ? (
                <>
                  <Icon name="alert-circle-outline" size={56} tone="error" />
                  <Text className="text-white text-center">{errorMsg}</Text>
                </>
              ) : (
                <>
                  <Icon name="check-decagram" size={56} tone="success" />
                  <Text variant="title" className="text-white">
                    {mode === 'checkin' ? 'Check-in thành công!' : 'Check-out thành công!'}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mode="video" mute />
              {phase === 'submitting' ? (
                <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/50 gap-2">
                  <Spinner color="#FFFFFF" />
                  <Text className="text-white text-[13px]">Đang xử lý…</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        <View className="bg-[#17131A] p-5 gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
          {phase === 'idle' ? (
            <Button icon="record-circle-outline" onPress={handleRecord}>
              Bắt đầu quay ({RECORD_DURATION_SEC} giây)
            </Button>
          ) : null}
          {phase === 'error' ? (
            <View className="flex-row gap-3">
              <Button variant="outline" action="neutral" className="flex-1" onPress={handleRetry} icon="camera-retake">
                Thử lại
              </Button>
              <Button className="flex-1" onPress={onClose}>Đóng</Button>
            </View>
          ) : null}
          {phase === 'success' ? (
            <Button onPress={onClose}>Đóng</Button>
          ) : null}
          {phase === 'recording' ? (
            <Text className="text-white/70 text-center text-[12px]">Đang quay… giữ khuôn mặt trong khung</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
