// ----------------------------------------------------------------------
// Đăng ký khuôn mặt kiểu Face ID: camera trong khung tròn, viền 72 vạch. Nhận diện khuôn mặt chạy trên máy (ML Kit qua
// VisionCamera) trả góc đầu (yaw / pitch, độ) mỗi khung hình; đầu nghiêng về hướng nào thì vạch hướng đó sáng. Ảnh gửi
// máy chủ: 1 ảnh nhìn thẳng (luôn gửi đầu tiên — máy chủ so mọi ảnh khác với ảnh này) + 1 ảnh mỗi hướng phải / trên /
// trái / dưới. Hàm ở đây thuần tính toán để test được không cần camera.
// ----------------------------------------------------------------------

export const TICK_COUNT = 72;
const TICK_STEP = 360 / TICK_COUNT;

/** Nhìn thẳng: cả yaw lẫn pitch dưới ngưỡng này (độ). */
export const STRAIGHT_MAX_DEG = 8;
/** Đầu lệch ít nhất chừng này mới làm sáng vạch. */
export const LIGHT_MIN_DEG = 10;
/** Ảnh theo hướng: lệch đủ rõ nhưng không quá nghiêng (ảnh quá nghiêng làm vector khuôn mặt kém chính xác). */
export const CAPTURE_MIN_DEG = 12;
export const CAPTURE_MAX_DEG = 32;
/** Sáng thêm chừng này vạch mỗi bên quanh hướng đầu đang nghiêng. */
export const LIGHT_SPREAD = 3;
/** Xong khi đủ tỉ lệ vạch sáng và đủ số ảnh theo hướng. */
export const DONE_COVERAGE = 0.85;
export const DONE_SECTOR_PHOTOS = 3;

export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };
export type Circle = { cx: number; cy: number; r: number };

export type Placement = 'ok' | 'none' | 'multi' | 'outside' | 'far' | 'near';

/** Khuôn mặt (toạ độ khung xem trước, đã soi gương như người dùng thấy) nằm gọn trong khung tròn chưa. */
export function placement(faces: Rect[], circle: Circle): Placement {
  if (faces.length === 0) return 'none';
  // Khuôn mặt thứ hai đủ rõ (người đứng sau) → không biết đăng ký ai.
  const sizable = faces.filter((f) => f.width >= circle.r * 0.5);
  if (sizable.length > 1) return 'multi';
  const face = sizable[0] ?? faces[0];
  const dx = face.x + face.width / 2 - circle.cx;
  const dy = face.y + face.height / 2 - circle.cy;
  if (Math.hypot(dx, dy) > circle.r * 0.35) return 'outside';
  const ratio = face.width / (circle.r * 2);
  if (ratio < 0.4) return 'far';
  if (ratio > 1.15) return 'near';
  return 'ok';
}

export function placementHint(p: Placement): string {
  switch (p) {
    case 'none':
      return 'Đưa khuôn mặt vào trong khung tròn';
    case 'multi':
      return 'Chỉ một người trong khung hình';
    case 'outside':
      return 'Đưa khuôn mặt vào giữa khung tròn';
    case 'far':
      return 'Đưa điện thoại lại gần hơn';
    case 'near':
      return 'Đưa điện thoại ra xa hơn một chút';
    default:
      return '';
  }
}

/**
 * Chiều yaw trên màn hình. Dấu yaw của ML Kit theo ảnh camera, còn khung xem trước camera trước được soi gương — và có
 * thể khác nhau giữa Android / iOS. Thay vì đoán, học từ landmark: mũi lệch sang bên nào so với giữa hai mắt (toạ độ
 * khung xem trước) là đầu đang quay về bên đó trên màn hình. Đủ 3 lần quan sát rõ thì chốt theo đa số.
 */
export function createYawCalibrator(initialSign: 1 | -1 = -1) {
  let agree = 0;
  let disagree = 0;
  return {
    /** @param noseOffset (mũi.x − giữa hai mắt.x) / khoảng cách hai mắt, toạ độ khung xem trước. */
    observe(yaw: number, noseOffset: number | null | undefined) {
      if (noseOffset == null || Math.abs(yaw) < 12 || Math.abs(noseOffset) < 0.08) return;
      if (Math.sign(yaw) === Math.sign(noseOffset)) agree += 1;
      else disagree += 1;
    },
    sign(): 1 | -1 {
      if (agree + disagree < 3) return initialSign;
      return agree >= disagree ? 1 : -1;
    },
  };
}

/** Mũi lệch so với giữa hai mắt, chia khoảng cách hai mắt (dương = lệch sang phải màn hình). */
export function noseOffset(leftEye?: Point, rightEye?: Point, nose?: Point): number | null {
  if (!leftEye || !rightEye || !nose) return null;
  const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (eyeDist < 1) return null;
  return (nose.x - (leftEye.x + rightEye.x) / 2) / eyeDist;
}

/**
 * Hướng đầu trên màn hình: góc (độ, 0 = phải, 90 = trên, ngược chiều kim đồng hồ) và độ lệch (độ).
 * @param yawSign dấu đổi yaw ML Kit sang "phải màn hình" (xem createYawCalibrator).
 * @param pitch ML Kit: dương = ngước lên.
 */
export function headDirection(yaw: number, pitch: number, yawSign: 1 | -1) {
  const x = yawSign * yaw;
  const y = pitch;
  const angle = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return { angle, magnitude: Math.hypot(x, y) };
}

export function isStraight(yaw: number, pitch: number): boolean {
  return Math.abs(yaw) < STRAIGHT_MAX_DEG && Math.abs(pitch) < STRAIGHT_MAX_DEG;
}

/** Vạch cần sáng cho hướng đầu hiện tại (rỗng nếu đầu gần như thẳng). */
export function ticksFor(angle: number, magnitude: number, spread = LIGHT_SPREAD): number[] {
  if (magnitude < LIGHT_MIN_DEG) return [];
  const center = Math.round(angle / TICK_STEP) % TICK_COUNT;
  const out: number[] = [];
  for (let d = -spread; d <= spread; d++) out.push((center + d + TICK_COUNT) % TICK_COUNT);
  return out;
}

export function coverage(lit: readonly boolean[]): number {
  return lit.filter(Boolean).length / TICK_COUNT;
}

/** Góc (độ, ngược chiều kim đồng hồ từ hướng phải) của vạch thứ i — để vẽ. */
export function tickAngle(i: number): number {
  return i * TICK_STEP;
}

export type Sector = 'right' | 'up' | 'left' | 'down';
export const SECTORS: readonly Sector[] = ['right', 'up', 'left', 'down'];
const SECTOR_CENTER: Record<Sector, number> = { right: 0, up: 90, left: 180, down: 270 };

/** Hướng cần chụp ảnh (nếu đầu đang nghiêng vừa đủ và gần một trong 4 hướng chính). */
export function sectorFor(angle: number, magnitude: number): Sector | null {
  if (magnitude < CAPTURE_MIN_DEG || magnitude > CAPTURE_MAX_DEG) return null;
  for (const s of SECTORS) {
    const diff = Math.abs(((angle - SECTOR_CENTER[s] + 540) % 360) - 180);
    if (diff <= 30) return s;
  }
  return null;
}

export function isDone(lit: readonly boolean[], sectorPhotos: number): boolean {
  return coverage(lit) >= DONE_COVERAGE && sectorPhotos >= DONE_SECTOR_PHOTOS;
}

/**
 * Đầu "đứng yên" ở một góc: trong STEADY_WINDOW_MS gần nhất góc yaw / pitch chỉ dao động ≤ STEADY_RANGE_DEG. Đo theo
 * khoảng dao động trong cửa sổ chứ không theo tốc độ giữa hai khung — ML Kit rung 1–3° giữa các khung (33 ms) nên tính
 * tốc độ ra 40–90°/giây dù đầu đứng yên (bản 2026-10-22 đầu tiên vì vậy không bao giờ chụp ảnh nghiêng).
 */
export const STEADY_WINDOW_MS = 250;
export const STEADY_RANGE_DEG = 6;
/** Chờ ở một hướng chưa có ảnh quá chừng này mà chưa "yên" → vẫn chụp (máy chủ bỏ ảnh mờ, không hỏng cả lượt). */
export const STEADY_GIVE_UP_MS = 1200;
/** Vòng tròn đã sáng đủ mà mới có 2 ảnh nghiêng → chờ thêm chừng này cho ảnh thứ 3 rồi lưu luôn. */
export const SAVE_GRACE_MS = 2500;

export function createSteadyTracker(windowMs = STEADY_WINDOW_MS, rangeDeg = STEADY_RANGE_DEG) {
  const poses: { t: number; yaw: number; pitch: number }[] = [];
  return {
    /** Ghi một khung; trả true khi đầu đã yên đủ một cửa sổ. */
    observe(t: number, yaw: number, pitch: number): boolean {
      poses.push({ t, yaw, pitch });
      // Giữ các khung trong cửa sổ + một khung ngay trước cửa sổ (để biết đã đủ dài chưa).
      while (poses.length > 2 && t - poses[1].t >= windowMs) poses.shift();
      if (t - poses[0].t < windowMs) return false;
      const range = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
      return range(poses.map((p) => p.yaw)) <= rangeDeg && range(poses.map((p) => p.pitch)) <= rangeDeg;
    },
    reset(): void {
      poses.length = 0;
    },
  };
}

/**
 * Lưu được chưa: vòng tròn sáng đủ và có đủ DONE_SECTOR_PHOTOS ảnh nghiêng; hoặc đã có 2 ảnh và vòng tròn sáng đủ được
 * SAVE_GRACE_MS (không bắt quay lại tìm hướng còn thiếu — máy chủ cần ảnh thẳng + ≥ 2 ảnh nghiêng đạt).
 */
export function readyToSave(lit: readonly boolean[], sectorPhotos: number, ringDoneFor: number): boolean {
  if (coverage(lit) < DONE_COVERAGE) return false;
  return sectorPhotos >= DONE_SECTOR_PHOTOS || (sectorPhotos >= 2 && ringDoneFor >= SAVE_GRACE_MS);
}
