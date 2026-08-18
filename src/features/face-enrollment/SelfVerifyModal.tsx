import { useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { verifySelfFace } from 'src/api/faceEnrollment';
import type { IVerifySelfResponse } from 'src/types/corecms-api';

const RECORD_DURATION_SEC = 3;

const REASON_LABELS: Record<string, string> = {
  NO_FACE_DETECTED: 'Không phát hiện khuôn mặt trong video.',
  MULTIPLE_FACES: 'Phát hiện nhiều hơn 1 khuôn mặt.',
  LIVENESS_FAILED: 'Không xác nhận được đây là người thật (liveness).',
  LOW_QUALITY: 'Chất lượng video chưa đủ rõ.',
  LOW_SIMILARITY: 'Khuôn mặt không đủ giống với hồ sơ đã đăng ký.',
  SERVICE_ERROR: 'Dịch vụ nhận diện khuôn mặt gặp sự cố.',
};

type Phase = 'idle' | 'recording' | 'processing' | 'result' | 'error';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Modal quay video ngắn để tự kiểm tra khuôn mặt hiện tại có khớp với embedding đã đăng ký
 *  không — chẩn đoán tự phục vụ, KHÔNG tạo attendance log. */
export function SelfVerifyModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<IVerifySelfResponse | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPhase('idle');
    setResult(null);
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

      setPhase('processing');
      const base64 = await FileSystem.readAsStringAsync(video.uri, { encoding: 'base64' });
      const res = await verifySelfFace(base64);
      setResult(res);
      setPhase('result');
    } catch (err) {
      setErrorMsg(extractApiError(err));
      setPhase('error');
    }
  }

  // Tự dừng quay sau RECORD_DURATION_SEC — recordAsync tự resolve khi maxDuration đạt, không
  // cần gọi stopRecording() thủ công, nhưng vẫn cho phép người dùng bấm để chờ xử lý sớm hơn.

  function handleRetry() {
    setResult(null);
    setErrorMsg(null);
    setPhase('idle');
  }

  if (!permission?.granted) return null;

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

        <View className="flex-1 bg-black">
          {phase === 'result' || phase === 'error' ? (
            <View className="flex-1 items-center justify-center gap-3 px-8">
              {phase === 'error' ? (
                <>
                  <Icon name="alert-circle-outline" size={56} tone="error" />
                  <Text className="text-white text-center">{errorMsg}</Text>
                </>
              ) : result ? (
                <>
                  <Icon
                    name={result.matched ? 'check-decagram' : 'close-circle-outline'}
                    size={56}
                    tone={result.matched ? 'success' : 'error'}
                  />
                  <Text variant="title" className="text-white">
                    {result.matched ? 'Khớp!' : 'Không khớp'}
                  </Text>
                  <Text className="text-white/70">Độ tương đồng: {Math.round(result.similarity * 100)}%</Text>
                  {!result.matched && result.reason ? (
                    <Text className="text-white/50 text-[12px] text-center">
                      {REASON_LABELS[result.reason] ?? result.reason}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          ) : (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" mode="video" mute />
              {phase === 'processing' ? (
                <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/50 gap-2">
                  <Spinner color="#FFFFFF" />
                  <Text className="text-white text-[13px]">Đang kiểm tra…</Text>
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
          {phase === 'result' || phase === 'error' ? (
            <View className="flex-row gap-3">
              <Button variant="outline" action="neutral" className="flex-1" onPress={handleRetry} icon="camera-retake">
                Thử lại
              </Button>
              <Button className="flex-1" onPress={onClose}>Đóng</Button>
            </View>
          ) : null}
          {phase === 'recording' ? (
            <Text className="text-white/70 text-center text-[12px]">Đang quay… giữ khuôn mặt trong khung</Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
