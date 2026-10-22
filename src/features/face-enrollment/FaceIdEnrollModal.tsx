import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { View, Modal, StyleSheet, StatusBar, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermissions } from 'expo-camera';

import { Text, Button, Pressable, Icon, Spinner } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { submitFaceEnrollment } from 'src/api/faceEnrollment';
import type { Face } from 'react-native-vision-camera-face-detector';

import type { FaceIdNative } from './face-id-native';
import {
  SECTORS,
  TICK_COUNT,
  coverage,
  createYawCalibrator,
  headDirection,
  isDone,
  isStraight,
  noseOffset,
  placement,
  placementHint,
  sectorFor,
  tickAngle,
  ticksFor,
  type Circle,
  type Sector,
} from './face-id-geometry';

// ----------------------------------------------------------------------
// Đăng ký khuôn mặt kiểu Face ID: camera trong khung tròn, viền 72 vạch. ML Kit chạy trên máy trả góc đầu mỗi khung
// hình (~30 hình/giây): nhìn thẳng giữ yên → chụp ảnh mốc; xoay đầu chậm theo vòng tròn → vạch hướng đó sáng xanh, mỗi
// hướng phải / trên / trái / dưới chụp thêm một ảnh. Đủ vòng → tải ảnh lên R2 (presigned, bucket riêng tư) rồi máy chủ
// tính vector: mọi ảnh phải cùng người với ảnh mốc, khuôn mặt chưa thuộc nhân viên khác, có kiểm tra người thật.
// ----------------------------------------------------------------------

const BG = '#0B0A0D';
const TICK_OFF = '#4A4550';
const TICK_ON = '#22C55E';
const TICK_LEN = 14;
const TICK_GAP = 14;
/** Giữ nhìn thẳng chừng này trước khi chụp ảnh mốc (đỡ chụp lúc đang di chuyển, ảnh nhoè). */
const HOLD_STRAIGHT_MS = 500;
/** Quá lâu vẫn chưa đủ vòng nhưng đã có ≥ 2 ảnh theo hướng → lưu luôn (máy chủ cần tối thiểu 3 ảnh). */
const SOFT_TIMEOUT_MS = 40_000;
const HARD_TIMEOUT_MS = 70_000;

type Phase = 'front' | 'rotate' | 'saving' | 'done' | 'error';

type Props = {
  native: FaceIdNative;
  visible: boolean;
  onClose: () => void;
  onEnrolled: () => void;
};

const Tick = memo(function Tick({ index, on, cx, cy, radius }: { index: number; on: boolean; cx: number; cy: number; radius: number }) {
  const a = (tickAngle(index) * Math.PI) / 180;
  const mid = radius + TICK_LEN / 2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: TICK_LEN,
        height: 3,
        borderRadius: 2,
        left: cx + mid * Math.cos(a) - TICK_LEN / 2,
        top: cy - mid * Math.sin(a) - 1.5,
        backgroundColor: on ? TICK_ON : TICK_OFF,
        transform: [{ rotate: `${-tickAngle(index)}deg` }],
      }}
    />
  );
});

/**
 * Ảnh góc nghiêng chỉ chụp khi đầu gần như đứng yên (đổi góc < STEADY_DEG_PER_S) đủ STEADY_HOLD_MS — chụp lúc đang
 * xoay hay bị mờ, máy chủ từ chối (20/102 ảnh trong 3 ngày tới 2026-10-22).
 */
const STEADY_DEG_PER_S = 30;
const STEADY_HOLD_MS = 200;

/** Tốc độ đổi góc đầu (độ / giây) giữa hai khung hình. */
export function headSpeed(
  prev: { yaw: number; pitch: number; t: number } | null,
  next: { yaw: number; pitch: number; t: number },
): number {
  if (!prev) return Infinity;
  const dt = Math.max(1, next.t - prev.t);
  return ((Math.abs(next.yaw - prev.yaw) + Math.abs(next.pitch - prev.pitch)) / dt) * 1000;
}

function toUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function FaceIdEnrollModal({ native, visible, onClose, onEnrolled }: Props) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const { Camera } = native.fd;
  const photoOutput = native.vc.usePhotoOutput({
    targetResolution: native.vc.CommonResolutions.HD_4_3,
    containerFormat: 'jpeg',
    quality: 0.85,
    qualityPrioritization: 'speed',
  });

  const [area, setArea] = useState<{ width: number; height: number } | null>(null);
  const [phase, setPhase] = useState<Phase>('front');
  const [hint, setHint] = useState('Đưa khuôn mặt vào trong khung tròn');
  const [lit, setLit] = useState<boolean[]>(() => Array(TICK_COUNT).fill(false));
  const [error, setError] = useState<string | null>(null);
  /** Máy chủ giữ khuôn mặt mới chờ quản lý duyệt (lần đầu, hoặc khác khuôn mặt đang dùng). */
  const [pendingApproval, setPendingApproval] = useState(false);

  const phaseRef = useRef<Phase>('front');
  const litRef = useRef<boolean[]>(Array(TICK_COUNT).fill(false));
  const calibratorRef = useRef(createYawCalibrator());
  const straightSinceRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const frontRef = useRef<string | null>(null);
  const sectorPhotosRef = useRef<Partial<Record<Sector, string>>>({});
  const rotateStartedRef = useRef<number>(0);
  const lastPoseRef = useRef<{ yaw: number; pitch: number; t: number } | null>(null);
  const steadySinceRef = useRef<number | null>(null);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const reset = useCallback(() => {
    litRef.current = Array(TICK_COUNT).fill(false);
    setLit(litRef.current);
    calibratorRef.current = createYawCalibrator();
    straightSinceRef.current = null;
    capturingRef.current = false;
    frontRef.current = null;
    sectorPhotosRef.current = {};
    lastPoseRef.current = null;
    steadySinceRef.current = null;
    setError(null);
    setHint('Đưa khuôn mặt vào trong khung tròn');
    go('front');
  }, [go]);

  useEffect(() => {
    if (visible) reset();
  }, [visible, reset]);

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

  const diameter = area ? Math.min(area.width - 72, area.height * 0.62, 320) : 0;
  const circle: Circle | null = area ? { cx: area.width / 2, cy: area.height * 0.44, r: diameter / 2 } : null;
  const circleRef = useRef<Circle | null>(null);
  circleRef.current = circle;

  const capture = useCallback(async (): Promise<string | null> => {
    if (capturingRef.current) return null;
    capturingRef.current = true;
    try {
      const file = await photoOutput.capturePhotoToFile({ enableShutterSound: false }, {});
      return toUri(file.filePath);
    } catch {
      return null;
    } finally {
      capturingRef.current = false;
    }
  }, [photoOutput]);

  const save = useCallback(async () => {
    go('saving');
    setHint('Đang lưu khuôn mặt…');
    const front = frontRef.current;
    const angles = SECTORS.map((s) => sectorPhotosRef.current[s]).filter((u): u is string => !!u);
    if (!front) {
      setError('Chưa chụp được ảnh nhìn thẳng — thử lại.');
      go('error');
      return;
    }
    try {
      // Ảnh nhìn thẳng PHẢI đứng đầu — máy chủ so mọi ảnh còn lại với ảnh này.
      const saved = await submitFaceEnrollment([front, ...angles].map((uri) => ({ uri })), (done, total) =>
        setHint(done < total ? `Đang tải ảnh ${done + 1}/${total}…` : 'Đang xác minh khuôn mặt…'),
      );
      setPendingApproval(saved?.status === 'PendingApproval');
      litRef.current = Array(TICK_COUNT).fill(true);
      setLit(litRef.current);
      go('done');
    } catch (err) {
      setError(extractApiError(err));
      go('error');
    }
  }, [go]);

  // Hết giờ khi đang xoay: đủ tối thiểu thì lưu, không thì mời thử lại.
  useEffect(() => {
    if (phase !== 'rotate') return undefined;
    const timer = setInterval(() => {
      if (phaseRef.current !== 'rotate') return;
      const elapsed = Date.now() - rotateStartedRef.current;
      const photos = Object.keys(sectorPhotosRef.current).length;
      if (elapsed > SOFT_TIMEOUT_MS && photos >= 2) save();
      else if (elapsed > HARD_TIMEOUT_MS) {
        setError('Chưa lấy đủ các góc — thử lại, xoay đầu chậm và rõ hơn theo vòng tròn.');
        go('error');
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [phase, save, go]);

  const onFacesDetected = useCallback(
    (faces: Face[]) => {
      const c = circleRef.current;
      const p = phaseRef.current;
      if (!c || (p !== 'front' && p !== 'rotate')) return;

      const place = placement(faces.map((f) => f.bounds), c);
      const face = faces.length === 1 ? faces[0] : faces.reduce<Face | null>((a, f) => (!a || f.bounds.width > a.bounds.width ? f : a), null);

      if (p === 'front') {
        if (place !== 'ok' || !face) {
          straightSinceRef.current = null;
          setHint(placementHint(place));
          return;
        }
        if (!isStraight(face.yawAngle, face.pitchAngle)) {
          straightSinceRef.current = null;
          setHint('Nhìn thẳng vào camera');
          return;
        }
        const now = Date.now();
        if (straightSinceRef.current === null) straightSinceRef.current = now;
        setHint('Giữ yên…');
        if (now - straightSinceRef.current < HOLD_STRAIGHT_MS || capturingRef.current) return;
        capture().then((uri) => {
          if (!uri || phaseRef.current !== 'front') return;
          frontRef.current = uri;
          rotateStartedRef.current = Date.now();
          setHint('Xoay đầu chậm theo vòng tròn');
          go('rotate');
        });
        return;
      }

      // Đang xoay: đầu lệch khỏi tâm là bình thường — chỉ dừng khi mất mặt hoặc có thêm người.
      if (place === 'none' || place === 'multi' || !face) {
        setHint(placementHint(place));
        return;
      }
      const lm = face.landmarks;
      calibratorRef.current.observe(face.yawAngle, noseOffset(lm?.LEFT_EYE, lm?.RIGHT_EYE, lm?.NOSE_BASE));
      const dir = headDirection(face.yawAngle, face.pitchAngle, calibratorRef.current.sign());

      const toLight = ticksFor(dir.angle, dir.magnitude).filter((i) => !litRef.current[i]);
      if (toLight.length > 0) {
        const next = litRef.current.slice();
        for (const i of toLight) next[i] = true;
        litRef.current = next;
        setLit(next);
      }
      setHint(coverage(litRef.current) < 0.5 ? 'Xoay đầu chậm theo vòng tròn' : 'Tiếp tục xoay để hoàn tất vòng tròn');

      // Đầu có đang đứng yên không (chụp lúc đang xoay dễ mờ).
      const now = Date.now();
      const pose = { yaw: face.yawAngle, pitch: face.pitchAngle, t: now };
      const speed = headSpeed(lastPoseRef.current, pose);
      lastPoseRef.current = pose;
      if (speed > STEADY_DEG_PER_S) steadySinceRef.current = null;
      else if (steadySinceRef.current === null) steadySinceRef.current = now;
      const steady = steadySinceRef.current !== null && now - steadySinceRef.current >= STEADY_HOLD_MS;

      const sector = sectorFor(dir.angle, dir.magnitude);
      if (sector && !sectorPhotosRef.current[sector] && !steady) {
        setHint('Giữ yên một chút…');
        return;
      }
      if (sector && !sectorPhotosRef.current[sector] && !capturingRef.current) {
        capture().then((uri) => {
          if (!uri || phaseRef.current !== 'rotate') return;
          sectorPhotosRef.current = { ...sectorPhotosRef.current, [sector]: uri };
          if (isDone(litRef.current, Object.keys(sectorPhotosRef.current).length)) save();
        });
        return;
      }
      if (isDone(litRef.current, Object.keys(sectorPhotosRef.current).length) && !capturingRef.current) save();
    },
    [capture, go, save],
  );

  const onCameraError = useCallback((e: Error) => {
    setError(e?.message || 'Không mở được camera');
    phaseRef.current = 'error';
    setPhase('error');
  }, []);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!area || area.width !== width || area.height !== height) setArea({ width, height });
  };

  const cameraActive = visible && !!permission?.granted && (phase === 'front' || phase === 'rotate');
  const maskBorder = 1200;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />
      <View className="flex-1" style={{ backgroundColor: BG }}>
        <View style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center px-2 py-1">
            <Pressable onPress={onClose} className="w-11 h-11 items-center justify-center">
              <Icon name="close" size={24} color="#FFFFFF" />
            </Pressable>
            <Text className="text-white font-bold flex-1 ml-1">Đăng ký khuôn mặt</Text>
          </View>
        </View>

        <View className="flex-1 overflow-hidden" onLayout={onLayout}>
          {permission?.granted && area && circle ? (
            <>
              {phase !== 'done' && phase !== 'error' ? (
                <Camera
                  style={StyleSheet.absoluteFill}
                  device="front"
                  isActive={cameraActive}
                  outputs={[photoOutput]}
                  resizeMode="cover"
                  autoMode
                  runLandmarks
                  performanceMode="fast"
                  cameraFacing="front"
                  onFacesDetected={onFacesDetected}
                  onError={onCameraError}
                />
              ) : null}
              {/* Mặt nạ: viền rất dày cùng màu nền chừa đúng một lỗ tròn — cắt khung camera thành hình tròn (bo góc
                  overflow không cắt được SurfaceView trên Android). */}
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: circle.cx - circle.r - maskBorder,
                  top: circle.cy - circle.r - maskBorder,
                  width: diameter + maskBorder * 2,
                  height: diameter + maskBorder * 2,
                  borderRadius: circle.r + maskBorder,
                  borderWidth: maskBorder,
                  borderColor: BG,
                }}
              />
              {lit.map((on, i) => (
                <Tick key={i} index={i} on={on || phase === 'done'} cx={circle.cx} cy={circle.cy} radius={circle.r + TICK_GAP} />
              ))}
              {phase === 'done' || phase === 'saving' ? (
                <View
                  pointerEvents="none"
                  style={{ position: 'absolute', left: circle.cx - circle.r, top: circle.cy - circle.r, width: diameter, height: diameter, borderRadius: circle.r }}
                  className="items-center justify-center bg-black/60"
                >
                  {phase === 'done' ? <Icon name="check-bold" size={72} color={TICK_ON} /> : <Spinner color="#FFFFFF" />}
                </View>
              ) : null}
              <View pointerEvents="none" style={{ position: 'absolute', left: 24, right: 24, top: circle.cy + circle.r + TICK_GAP + TICK_LEN + 28 }}>
                <Text className="text-white text-center text-[17px] font-bold">
                  {phase === 'done'
                    ? pendingApproval
                      ? 'Đã gửi — chờ quản lý duyệt'
                      : 'Đã đăng ký khuôn mặt'
                    : phase === 'error'
                      ? 'Đăng ký chưa thành công'
                      : hint}
                </Text>
                {phase === 'front' ? (
                  <Text className="text-white/60 text-center text-[13px] mt-2">Nhìn thẳng — ảnh nhìn thẳng được chụp tự động.</Text>
                ) : phase === 'rotate' ? (
                  <Text className="text-white/60 text-center text-[13px] mt-2">Xoay đầu chậm thành vòng tròn đến khi các vạch sáng hết.</Text>
                ) : phase === 'done' && pendingApproval ? (
                  <Text className="text-white/70 text-center text-[13px] mt-2">
                    Quản lý sẽ xem ảnh và duyệt. Trong lúc chờ, bạn vẫn chấm công bằng khuôn mặt cũ (nếu đã có).
                  </Text>
                ) : phase === 'error' && error ? (
                  <Text className="text-white/70 text-center text-[13px] mt-2">{error}</Text>
                ) : null}
              </View>
            </>
          ) : null}
        </View>

        <View style={{ paddingBottom: insets.bottom + 16 }} className="px-5 gap-3">
          {phase === 'done' ? (
            <Button onPress={onEnrolled}>Xong</Button>
          ) : phase === 'error' ? (
            <>
              <Button icon="camera-retake" onPress={reset}>Thử lại</Button>
              <Button variant="outline" action="neutral" onPress={onClose}>Để sau</Button>
            </>
          ) : (
            <Text className="text-white/50 text-center text-[12px]">
              Chỉ một người trước camera, đủ sáng, không đeo khẩu trang.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
