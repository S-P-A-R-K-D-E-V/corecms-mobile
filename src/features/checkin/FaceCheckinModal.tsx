import { useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { checkEnrollQuality } from 'src/api/faceEnrollment';
import { smartCheckInFace, smartCheckOutFace, checkInFace, checkinFace } from 'src/api/attendance';
import { useAuthContext } from 'src/auth/auth-context';
import type { IEnrollQualityResponse } from 'src/types/corecms-api';
import type { Coords } from './utils';

// ----------------------------------------------------------------------
// Check-in/check-out bằng khuôn mặt — camera mở tự động, KHÔNG có nút bấm quay: liên tục lấy
// mẫu frame nền và validate qua face-tracking-service (đúng pattern tự-động-nhận-diện của
// face-enrollment, bước "Nhìn thẳng") tới khi có 1 tấm đạt, tự chụp tấm đó rồi gửi thẳng sang
// BE verify BẮT BUỘC (không phải video quay tay + verify best-effort như trước) — không khớp/
// không đủ tin cậy thì BE tự chặn hẳn check-in/out.
// mode='checkin'|'checkout': chạy SONG SONG với luồng chụp ảnh cũ (FaceCaptureModal).
// mode='overtime': THAY THẾ hẳn luồng chụp ảnh cũ cho action "Check-in ngoài giờ".

const POLL_INTERVAL_MS = 900;
const YAW_STRAIGHT_MAX = 0.08;
const PITCH_STRAIGHT_MAX = 0.08;
const MIN_QUALITY = 0.55; // khớp Settings.QUALITY_THRESHOLD face-tracking-service — xem FaceEnrollmentScreen.tsx

function validateStraight(q: IEnrollQualityResponse): string | null {
  if (q.qualityScore < MIN_QUALITY) {
    return 'Ảnh chưa đủ rõ — di chuyển tới nơi đủ sáng, giữ máy ổn định.';
  }
  if (Math.abs(q.yaw) > YAW_STRAIGHT_MAX || Math.abs(q.pitch) > PITCH_STRAIGHT_MAX) {
    return 'Vui lòng nhìn thẳng vào camera.';
  }
  return null;
}

function isNotEnrolledError(err: any): boolean {
  const errorCode = err?.errors && typeof err.errors === 'object' ? Object.keys(err.errors)[0] : null;
  return errorCode === 'FaceTracking.NoFaceEmbedding';
}

type Phase = 'opening' | 'scanning' | 'submitting' | 'success' | 'error';

type Props = {
  visible: boolean;
  mode: 'checkin' | 'checkout' | 'overtime';
  coords: Coords | null;
  onClose: () => void;
  /** Gọi khi check-in/out thành công — cha tự refetch(). */
  onSuccess: () => void;
};

export function FaceCheckinModal({ visible, mode, coords, onClose, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const cameraRef = useRef<CameraView>(null);
  const busyRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('opening');
  const [hint, setHint] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notEnrolled, setNotEnrolled] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPhase('opening');
    setHint(null);
    setErrorMsg(null);
    setNotEnrolled(false);
    if (!permission?.granted) {
      requestPermission().then((res) => {
        if (res.granted) setPhase('scanning');
      });
    } else {
      setPhase('scanning');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function handleSubmit(imageBase64: string) {
    setPhase('submitting');
    try {
      const payload = {
        imageBase64,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        accuracy: coords?.accuracy,
      };
      // faceMatchConfidence (%) do RequireFaceMatchAsync tính ngay khi verify — đưa vào nội
      // dung Telegram để biết đúng người với độ tin cậy bao nhiêu, không phải đoán mò.
      let matchConfidence: number | undefined;
      if (mode === 'checkin') {
        matchConfidence = (await smartCheckInFace(payload)).faceMatchConfidence;
      } else if (mode === 'checkout') {
        matchConfidence = (await smartCheckOutFace(payload))[0]?.faceMatchConfidence;
      } else {
        matchConfidence = (await checkInFace({ ...payload, isOvertime: true })).faceMatchConfidence;
      }
      // Đẩy ảnh lên Telegram — không chặn kết quả check-in/out nếu lỗi (chỉ là thông báo phụ).
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
      // Tự đóng modal sau khi cha đã hiện SuccessOverlay — tránh còn sót khung camera/nút
      // "Đóng" thủ công khiến người dùng tưởng chưa xong dù check-in/out đã thành công.
      setTimeout(onClose, 700);
    } catch (err) {
      setErrorMsg(extractApiError(err));
      setNotEnrolled(isNotEnrolledError(err));
      setPhase('error');
    }
  }

  // ── Auto-detect: lấy mẫu frame nền, tự chụp khi đạt "nhìn thẳng" — KHÔNG cần bấm nút. ──
  useEffect(() => {
    if (phase !== 'scanning' || !permission?.granted) return undefined;

    const interval = setInterval(async () => {
      if (busyRef.current || !cameraRef.current) return;
      busyRef.current = true;
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.5, base64: true, skipProcessing: true });
        if (!photo?.base64) return;

        const quality = await checkEnrollQuality(photo.base64);
        const error = validateStraight(quality);
        if (error) {
          setHint(error);
          return;
        }
        setHint(null);
        await handleSubmit(photo.base64);
      } catch (err) {
        setHint(extractApiError(err));
      } finally {
        busyRef.current = false;
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, permission?.granted]);

  function handleRetry() {
    setErrorMsg(null);
    setNotEnrolled(false);
    setPhase('scanning');
  }

  if (!permission?.granted) return null;

  const title =
    mode === 'checkout' ? 'Check-out bằng khuôn mặt' : mode === 'overtime' ? 'Check-in ngoài giờ bằng khuôn mặt' : 'Check-in bằng khuôn mặt';

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
                    {mode === 'checkout' ? 'Check-out thành công!' : 'Check-in thành công!'}
                  </Text>
                </>
              )}
            </View>
          ) : (
            <>
              <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="front" />
              <View style={StyleSheet.absoluteFill} pointerEvents="none" className="items-center justify-center">
                <View
                  style={{ width: 220, height: 280, borderRadius: 140, borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)' }}
                />
              </View>
              {phase === 'submitting' ? (
                <View style={StyleSheet.absoluteFill} className="items-center justify-center bg-black/50 gap-2">
                  <Spinner color="#FFFFFF" />
                  <Text className="text-white text-[13px]">Đang xác thực…</Text>
                </View>
              ) : null}
            </>
          )}
        </View>

        <View className="bg-[#17131A]" style={{ paddingBottom: insets.bottom + 16 }}>
          {phase === 'scanning' ? (
            <View className="px-4 py-3 flex-row items-center gap-2">
              <Spinner color="#FFFFFF" />
              <Text className="text-white text-[13px] flex-1">{hint ?? 'Giữ khuôn mặt trong khung, nhìn thẳng vào camera…'}</Text>
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
