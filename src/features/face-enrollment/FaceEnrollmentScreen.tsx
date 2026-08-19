import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Screen } from 'src/components/shared';
import { Text, Button, Icon, SuccessOverlay } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { checkEnrollQuality, submitFaceEnrollment } from 'src/api/faceEnrollment';
import { useAuthContext } from 'src/auth/auth-context';
import type { IEnrollQualityResponse } from 'src/types/corecms-api';

import { FaceEnrollmentCameraModal } from './FaceEnrollmentCameraModal';
import { SelfVerifyModal } from './SelfVerifyModal';

// ----------------------------------------------------------------------

type StepKey = 'straight' | 'left' | 'right' | 'up' | 'down' | 'blink';

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  { key: 'straight', label: 'Nhìn thẳng', hint: 'Giữ khuôn mặt thẳng, nhìn vào camera' },
  { key: 'left', label: 'Quay trái', hint: 'Xoay đầu sang trái một góc rõ rệt' },
  { key: 'right', label: 'Quay phải', hint: 'Xoay đầu sang phải một góc rõ rệt' },
  { key: 'up', label: 'Ngước lên', hint: 'Ngước cằm lên trên' },
  { key: 'down', label: 'Cúi xuống', hint: 'Cúi cằm xuống dưới' },
  // 'blink' tạm bỏ khỏi luồng — BLINK_EAR_THRESHOLD chưa được calibrate bằng ảnh mẫu thật
  // (xem README face-tracking-service), single-frame EAR check hiện gần như không bao giờ
  // bắt được đúng khoảnh khắc nhắm mắt qua polling 900ms. validateStep vẫn giữ case 'blink'
  // để bật lại nhanh sau khi calibrate xong.
];

// Ngưỡng heuristic — yaw/pitch từ Core-be là ước lượng thô (xem docstring
// estimate_yaw_pitch trong face-tracking-service), KHÔNG phải góc độ chính xác.
const YAW_STRAIGHT_MAX = 0.08;
const YAW_TURN_MIN = 0.15;
const PITCH_STRAIGHT_MAX = 0.08;
const PITCH_TILT_MIN = 0.12;
// Phải khớp Settings.QUALITY_THRESHOLD của face-tracking-service (0.55) — đây là ngưỡng
// SERVER thật sự dùng để quyết định có tính embedding hay không lúc enroll/batch (khác hẳn
// enroll/quality, chỉ check phát hiện khuôn mặt chứ không gate theo ngưỡng này). Trước đây để
// 0.35 (lỏng hơn) khiến ảnh qua được bước chụp nhưng bị 422 "Không phát hiện khuôn mặt đạt
// chất lượng tối thiểu" ở bước submit cuối — luôn thất bại dù chụp đủ 5 bước.
const MIN_QUALITY = 0.55;

const STEP_PASS_PAUSE_MS = 600;

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
    return 'Ảnh chưa đủ rõ nét — vui lòng di chuyển tới nơi đủ sáng, giữ máy ổn định.';
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
        return 'Xoay đầu rõ hơn nữa.';
      }
      return null;
    case 'up':
      if (q.pitch < PITCH_TILT_MIN) {
        return 'Ngước cằm lên cao hơn.';
      }
      return null;
    case 'down':
      if (q.pitch > -PITCH_TILT_MIN) {
        return 'Cúi cằm xuống thấp hơn.';
      }
      return null;
    case 'blink':
      if (!q.blinkDetected) {
        return 'Chưa phát hiện chớp mắt — nhìn thẳng và chớp mắt liên tục.';
      }
      return null;
    default:
      return null;
  }
}

type Mode = 'status' | 'capture';

export function FaceEnrollmentScreen() {
  const { user, refreshUser } = useAuthContext();
  const isAdminOrManager =
    user?.role === 'Admin' || user?.role === 'Manager' || (user?.roles ?? []).some((r) => r === 'Admin' || r === 'Manager');

  const [mode, setMode] = useState<Mode>(user?.hasFaceEmbedding ? 'status' : 'capture');
  const manualCaptureRef = useRef(false);
  useEffect(() => {
    if (manualCaptureRef.current) return;
    setMode(user?.hasFaceEmbedding ? 'status' : 'capture');
  }, [user?.hasFaceEmbedding]);

  const [verifyOpen, setVerifyOpen] = useState(false);

  type CapturedPhoto = { base64: string; uri: string };
  const [stepIndex, setStepIndex] = useState(0);
  const [images, setImages] = useState<CapturedPhoto[]>([]);
  const imagesRef = useRef<CapturedPhoto[]>([]);
  const [stepPassed, setStepPassed] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [failedReason, setFailedReason] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  async function handleSubmit(finalImages: CapturedPhoto[]) {
    setSubmitting(true);
    setFailedReason(null);
    try {
      await submitFaceEnrollment(finalImages.map((p) => ({ uri: p.uri })));
      setDone(true);
      refreshUser().catch(() => {});
    } catch (err) {
      setFailedReason(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFrame(photo: CapturedPhoto) {
    if (validating || stepPassed) return;
    setValidating(true);
    try {
      const quality = await checkEnrollQuality(photo.base64);
      const error = validateStep(step.key, quality);
      if (error) {
        setHint(error);
        return;
      }

      setHint(null);
      setStepPassed(true);
      const next = [...imagesRef.current, photo];
      imagesRef.current = next;
      setImages(next);

      setTimeout(() => {
        setStepPassed(false);
        if (stepIndex + 1 >= STEPS.length) {
          handleSubmit(next);
        } else {
          setStepIndex((i) => i + 1);
        }
      }, STEP_PASS_PAUSE_MS);
    } catch (err) {
      setHint(extractApiError(err));
    } finally {
      setValidating(false);
    }
  }

  function handleReset() {
    setStepIndex(0);
    setImages([]);
    imagesRef.current = [];
    setFailedReason(null);
    setDone(false);
    setHint(null);
    setStepPassed(false);
  }

  function startReenroll() {
    manualCaptureRef.current = true;
    handleReset();
    setMode('capture');
  }

  async function handleCloseCamera() {
    if (images.length > 0) {
      const ok = await confirm({
        title: 'Huỷ đăng ký khuôn mặt?',
        message: 'Các ảnh đã lấy sẽ không được lưu.',
        confirmText: 'Huỷ bỏ',
        destructive: true,
      });
      if (!ok) return;
    }
    router.back();
  }

  if (mode === 'status') {
    return (
      <Screen tabBarInset={false} contentClassName="items-center justify-center">
        <View className="items-center gap-4 px-6">
          <Icon name="check-decagram" size={56} tone="success" />
          <Text variant="title" className="text-center">Bạn đã đăng ký khuôn mặt</Text>
          <Text tone="muted" className="text-center">
            Có thể dùng khuôn mặt để chấm công tại quầy.
          </Text>
          <View className="w-full gap-3 mt-2">
            <Button icon="face-recognition" onPress={() => setVerifyOpen(true)}>
              Kiểm tra so khớp
            </Button>
            <Button variant="outline" action="neutral" icon="camera-retake" disabled={!isAdminOrManager} onPress={startReenroll}>
              Đăng ký lại
            </Button>
            {!isAdminOrManager ? (
              <Text tone="muted" className="text-center text-[12px]">
                Cần Admin hoặc Quản lý thực hiện đăng ký lại — liên hệ quản lý nếu khuôn mặt thay đổi nhiều.
              </Text>
            ) : null}
          </View>
        </View>

        <SelfVerifyModal visible={verifyOpen} onClose={() => setVerifyOpen(false)} />
      </Screen>
    );
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
          <Button fullWidth={false} onPress={handleReset} icon="camera-retake">Thử lại từ đầu</Button>
          <Button fullWidth={false} variant="outline" action="neutral" onPress={() => router.back()}>Để sau</Button>
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
            Giữ khuôn mặt trong khung, xoay theo hướng dẫn — tự động nhận diện {STEPS.length} góc, không cần bấm chụp.
          </Text>
        </View>
      )}

      <FaceEnrollmentCameraModal
        visible={!failedReason && !submitting}
        stepLabel={step.label}
        stepIndex={stepIndex}
        totalSteps={STEPS.length}
        stepPassed={stepPassed}
        hint={hint ?? step.hint}
        onClose={handleCloseCamera}
        onFrame={handleFrame}
      />
    </Screen>
  );
}
