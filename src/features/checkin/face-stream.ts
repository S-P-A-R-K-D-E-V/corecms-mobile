// ----------------------------------------------------------------------
// Quét khuôn mặt trực tiếp khi chấm công (giống kiosk trên web): app gửi khung hình ~4 hình/giây qua SignalR
// /hubs/self-verify, máy chủ (face-tracking-service) trả vị trí khuôn mặt (tracks) để vẽ khung, tự kiểm tra người thật
// rồi so 1:1 với khuôn mặt đã đăng ký (verify_result). Khớp → app gửi đúng khung hình đó tới smart-check-in-face /
// smart-check-out-face — máy chủ so lại một lần nữa trước khi ghi chấm công (không tin kết quả từ app).
// Các hàm ở đây là phần tính toán thuần (chọn cỡ ảnh, đổi toạ độ khung, màu / lời nhắc) để test được.
// ----------------------------------------------------------------------

export type TrackState = 'NEW' | 'TRACKING' | 'QUALITY_OK' | 'LIVENESS_PASSED' | 'LIVENESS_FAILED' | 'EMBEDDED';

/** bbox: [x1, y1, x2, y2] theo pixel của khung hình đã gửi (ảnh đã xoay đúng chiều). */
export type FaceTrack = { trackId: string; bbox: [number, number, number, number]; confidence: number; state: TrackState };

export type VerifyResult = { trackId: string; matched: boolean; similarity: number };

export type Size = { width: number; height: number };

export type Rect = { left: number; top: number; width: number; height: number };

/** Gửi lên máy chủ: đủ rõ để nhận diện, đủ nhẹ để ~4 hình/giây trên 4G (~40 KB / hình). */
const TARGET_LONG_SIDE = 640;

/**
 * Cỡ ảnh chụp cho luồng quét: nhỏ nhất mà cạnh dài ≥ 640 px, ưu tiên tỉ lệ 4:3 (khớp khung xem trước 3:4).
 * Android trả "WxH"; iOS trả cả tên preset ("Photo", "High"…) lẫn "640x480". Không có cỡ phù hợp → undefined (mặc định).
 */
export function pickPictureSize(sizes: readonly string[]): string | undefined {
  const parsed = sizes
    .map((s) => {
      const m = /^(\d+)x(\d+)$/.exec(s.trim());
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2]);
      return { s, long: Math.max(a, b), short: Math.min(a, b) };
    })
    .filter((x): x is { s: string; long: number; short: number } => !!x && x.long >= TARGET_LONG_SIDE);
  if (parsed.length === 0) return undefined;
  const fourThree = parsed.filter((x) => Math.abs(x.long / x.short - 4 / 3) < 0.02);
  const pool = fourThree.length > 0 ? fourThree : parsed;
  return pool.sort((x, y) => x.long * x.short - y.long * y.short)[0]!.s;
}

/**
 * Kích thước khung hình sau khi xoay đúng chiều (máy chủ đọc ảnh theo EXIF): ảnh camera thô thường nằm ngang, màn hình
 * dọc thì ảnh đã xoay là dọc.
 */
export function orientedFrameSize(width: number, height: number, portrait: boolean): Size {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  return portrait ? { width: short, height: long } : { width: long, height: short };
}

/**
 * Khung khuôn mặt trên màn xem trước: xem trước lấp đầy khung (cover) và soi gương (camera trước) — ảnh gửi đi thì
 * không soi gương, nên lật trục x.
 */
export function trackRectInView(bbox: FaceTrack['bbox'], frame: Size, view: Size, mirror = true): Rect {
  const scale = Math.max(view.width / frame.width, view.height / frame.height);
  const offsetX = (view.width - frame.width * scale) / 2;
  const offsetY = (view.height - frame.height * scale) / 2;
  const [x1, y1, x2, y2] = bbox;
  const left = mirror ? frame.width - x2 : x1;
  return {
    left: offsetX + left * scale,
    top: offsetY + y1 * scale,
    width: (x2 - x1) * scale,
    height: (y2 - y1) * scale,
  };
}

export const FACE_COLORS = {
  detecting: '#FFFFFF',
  live: '#38BDF8',
  matched: '#22C55E',
  mismatch: '#F43F5E',
  multi: '#F59E0B',
} as const;

export type FaceStatus = 'searching' | 'multi' | 'detecting' | 'live' | 'spoof' | 'matched' | 'mismatch';

/** Trạng thái hiển thị của khuôn mặt duy nhất trong khung (hoặc nhiều mặt / chưa thấy mặt). */
export function faceStatus(tracks: readonly FaceTrack[], verify: VerifyResult | null): FaceStatus {
  if (tracks.length === 0) return 'searching';
  if (tracks.length > 1) return 'multi';
  const track = tracks[0]!;
  if (track.state === 'LIVENESS_FAILED') return 'spoof';
  if (verify && verify.trackId === track.trackId) return verify.matched ? 'matched' : 'mismatch';
  if (track.state === 'LIVENESS_PASSED' || track.state === 'EMBEDDED') return 'live';
  return 'detecting';
}

export function faceColor(status: FaceStatus): string {
  switch (status) {
    case 'matched':
      return FACE_COLORS.matched;
    case 'mismatch':
    case 'spoof':
      return FACE_COLORS.mismatch;
    case 'multi':
      return FACE_COLORS.multi;
    case 'live':
      return FACE_COLORS.live;
    default:
      return FACE_COLORS.detecting;
  }
}

export function faceHint(status: FaceStatus): string {
  switch (status) {
    case 'searching':
      return 'Đưa khuôn mặt vào khung hình';
    case 'multi':
      return 'Chỉ một người trong khung hình';
    case 'detecting':
      return 'Đang nhận diện… nhìn thẳng vào camera';
    case 'live':
      return 'Đang so khuôn mặt…';
    case 'spoof':
      return 'Không xác thực được khuôn mặt thật — không dùng ảnh / màn hình';
    case 'matched':
      return 'Đã nhận ra bạn';
    case 'mismatch':
      return 'Khuôn mặt không khớp với tài khoản này';
  }
}
