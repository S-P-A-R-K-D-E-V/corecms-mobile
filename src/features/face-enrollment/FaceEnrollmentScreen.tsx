import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from 'src/components/shared';
import { Text, Button, Icon, SuccessOverlay } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { checkEnrollQuality, submitFaceEnrollment } from 'src/api/faceEnrollment';
import type { IEnrollQualityResponse } from 'src/types/corecms-api';

import { FaceEnrollmentCameraModal } from './FaceEnrollmentCameraModal';

// ----------------------------------------------------------------------

type StepKey = 'straight' | 'left' | 'right' | 'up' | 'down' | 'blink';

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: 'straight', label: 'Nhìn thẳng', hint: 'Giữ khuôn mặt thẳng, nhìn vào camera' },
  { key: 'left', label: 'Quay trái', hint: 'Xoay đầu sang trái một góc rõ rệt' },
  { key: 'right', label: 'Quay phải', hint: 'Xoay đầu sang phải một góc rõ rệt' },
  { key: 'up', label: 'Ngước lên', hint: 'Ngước cằm lên trên' },
  { key: 'down', label: 'Cúi xuống', hint: 'Cúi cằm xuống dưới' },
  { key: 'blink', label: 'Chớp mắt', hint: 'Nhìn thẳng vào camera và chớp mắt ngay lúc chụp' },
];

// Ngưỡng heuristic — yaw/pitch từ Core-be là ước lượng thô (xem docstring
// estimate_yaw_pitch trong face-tracking-service), KHÔNG phải góc độ chính xác.
const YAW_STRAIGHT_MAX = 0.08;
const YAW_TURN_MIN = 0.15;
const PITCH_STRAIGHT_MAX = 0.08;
const PITCH_TILT_MIN = 0.12;
const MIN_QUALITY = 0.35;

/** Validate kết quả enroll/quality theo đúng bước hiện tại. Trả về null nếu hợp lệ, hoặc
 *  thông báo lỗi để yêu cầu chụp lại.
 *
 *  Lưu ý QUAN TRỌNG: face-tracking-service tự nói rõ dấu của `yaw` phụ thuộc hướng camera/ảnh
 *  gương, KHÔNG suy ra được "trái"/"phải" tuyệt đối chỉ từ công thức đó (xem
 *  estimate_yaw_pitch trong quality.py). Vì vậy 2 bước "Quay trái"/"Quay phải" ở đây CHỈ xác
 *  nhận đã xoay đủ góc (|yaw| vượt ngưỡng), KHÔNG phân biệt đúng chiều theo hướng dẫn — mục
 *  tiêu là đa dạng góc chụp cho embedding, không phải kiểm tra tuân thủ chiều xoay.
 */
function validateStep(step: StepKey, q: IEnrollQualityResponse): string | null {
  if (q.qualityScore < MIN_QUALITY) {
    return 'Ảnh chưa đủ rõ nét — vui lòng chụp lại ở nơi đủ sáng, giữ máy ổn định.';
  }
  switch (step) {
    case 'straight':
      if (Math.abs(q.yaw) > YAW_STRAIGHT_MAX || Math.abs(q.pitch) > PITCH_STRAIGHT_MAX) {
        return 'Vui lòng nhìn thẳng vào camera.';
      }
      return null;
    case 'left':
    case 'right':
      if (Math.abs(q.yaw) < YAW_TURN_MIN) {
        return 'Vui lòng xoay đầu rõ hơn nữa.';
      }
      return null;
    case 'up':
      if (q.pitch < PITCH_TILT_MIN) {
        return 'Vui lòng ngước cằm lên cao hơn.';
      }
      return null;
    case 'down':
      if (q.pitch > -PITCH_TILT_MIN) {
        return 'Vui lòng cúi cằm xuống thấp hơn.';
      }
      return null;
    case 'blink':
      if (!q.blinkDetected) {
        return 'Chưa phát hiện chớp mắt — vui lòng nhìn thẳng và chớp mắt ngay lúc chụp.';
      }
      return null;
    default:
      return null;
  }
}

export function FaceEnrollmentScreen() {
  const [stepIndex, setStepIndex] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [cameraVisible, setCameraVisible] = useState(true);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failedReason, setFailedReason] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  async function handleSubmit(finalImages: string[]) {
    setSubmitting(true);
    setFailedReason(null);
    try {
      await submitFaceEnrollment(finalImages);
      setDone(true);
    } catch (err) {
      setFailedReason(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCapture(base64: string) {
    setValidating(true);
    try {
      const quality = await checkEnrollQuality(base64);
      const error = validateStep(step.key, quality);
      if (error) {
        toast.error(error);
        return;
      }

      const next = [...images, base64];
      setImages(next);

      if (stepIndex + 1 >= STEPS.length) {
        setCameraVisible(false);
        await handleSubmit(next);
      } else {
        setStepIndex(stepIndex + 1);
      }
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setValidating(false);
    }
  }

  function handleReset() {
    setStepIndex(0);
    setImages([]);
    setFailedReason(null);
    setDone(false);
    setCameraVisible(true);
  }

  async function handleCloseCamera() {
    if (images.length > 0) {
      const ok = await confirm({
        title: 'Huỷ đăng ký khuôn mặt?',
        message: 'Các ảnh đã chụp sẽ không được lưu.',
        confirmText: 'Huỷ bỏ',
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  }

  if (done) {
    return (
      <SuccessOverlay
        visible
        message="Đăng ký khuôn mặt thành công!"
        onDone={() => router.back()}
      />
    );
  }

  return (
    <Screen tabBarInset={false} contentClassName="items-center justify-center">
      {failedReason ? (
        <View className="items-center gap-4 px-6">
          <Icon name="alert-circle-outline" size={56} tone="error" />
          <Text variant="title" className="text-center">Đăng ký thất bại</Text>
          <Text tone="muted" className="text-center">{failedReason}</Text>
          <Button onPress={handleReset} icon="camera-retake">Thử lại từ đầu</Button>
          <Button variant="outline" action="neutral" onPress={() => router.back()}>Để sau</Button>
        </View>
      ) : submitting ? (
        <View className="items-center gap-4 px-6">
          <Text variant="title" className="text-center">Đang gửi ảnh đăng ký…</Text>
          <Text tone="muted" className="text-center">Vui lòng đợi trong giây lát</Text>
        </View>
      ) : (
        <View className="items-center gap-4 px-6">
          <Icon name="face-recognition" size={56} tone="primary" />
          <Text variant="title" className="text-center">Đăng ký khuôn mặt</Text>
          <Text tone="muted" className="text-center">
            Chụp {STEPS.length} góc mặt khác nhau để chấm công qua khuôn mặt chính xác hơn.
          </Text>
        </View>
      )}

      <FaceEnrollmentCameraModal
        visible={cameraVisible}
        stepLabel={step.label}
        stepHint={step.hint}
        stepIndex={stepIndex}
        totalSteps={STEPS.length}
        validating={validating}
        onClose={handleCloseCamera}
        onCapture={handleCapture}
      />
    </Screen>
  );
}
