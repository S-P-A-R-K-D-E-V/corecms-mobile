import { hasApiErrorCode } from 'src/services/error';
import type { Coords } from './utils';

// ----------------------------------------------------------------------
// Vị trí khi chấm công: GPS lỗi thì thử lại liên tục trong ~5 giây. Hết 5 giây vẫn không được → vẫn cho chấm công, gửi
// locationUnavailable để máy chủ ghi lần này "không có GPS" cho quản lý xem lại.
//
// Ngay lúc GỬI check-in / check-out (sau khi chụp ảnh / quét mặt xong): ping máy chủ (POST /attendance/location-ping) rồi
// mới lấy điểm GPS — điểm GPS máy trả từ bộ đệm (có trước lần ping) bị bỏ, lấy lại. Gửi kèm mã ping + tuổi điểm GPS; máy
// chủ kiểm lại, vị trí cũ thì trả Attendance.LocationStale → app ping + lấy vị trí lại, gửi lại một lần.
// ----------------------------------------------------------------------

/** Thử lại GPS tối đa chừng này trước khi cho chấm công không vị trí. */
export const GPS_RETRY_WINDOW_MS = 5000;
/** Lúc BẤM nút (kiểm tra trước có ở cửa hàng không): vị trí lấy trong chừng này còn dùng lại được. */
export const LOCATION_FRESH_MS = 15_000;
/** Điểm GPS có trước lần ping quá chừng này (đồng hồ máy) → điểm cũ trong bộ đệm, lấy lại. */
export const FIX_CLOCK_SKEW_MS = 2000;
const RETRY_PAUSE_MS = 700;

/** Hết `ms` mà promise chưa xong → lỗi (định vị của máy có thể treo lâu hơn nhiều). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), Math.max(0, ms));
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Gọi `getPosition` (nhận thời gian còn lại, ms) cho tới khi được hoặc hết `windowMs`; nghỉ ngắn giữa các lần thử.
 * Trả null khi hết giờ.
 */
export async function retryLocation<T = Coords>(
  getPosition: (remainingMs: number) => Promise<T>,
  windowMs = GPS_RETRY_WINDOW_MS,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T | null> {
  const deadline = now() + windowMs;
  for (;;) {
    const remaining = deadline - now();
    if (remaining <= 0) return null;
    try {
      return await getPosition(remaining);
    } catch {
      // Lỗi / quá giờ một lần → thử lại nếu còn thời gian.
    }
    const left = deadline - now();
    if (left <= 0) return null;
    await sleep(Math.min(RETRY_PAUSE_MS, left));
  }
}

/** Một điểm GPS máy trả về. */
export interface RawFix {
  coords: Coords;
  /** Thời điểm của điểm GPS (ms, đồng hồ máy). */
  timestamp: number;
  /** Android: vị trí đến từ ứng dụng giả lập vị trí. */
  mocked: boolean;
}

/** Vị trí dùng cho MỘT lần gửi chấm công (lấy sau lần ping máy chủ). */
export interface LocationFix {
  coords: Coords | null;
  /** GPS lỗi sau ~5 giây — vẫn chấm công, máy chủ ghi "không có vị trí". */
  unavailable: boolean;
  /** Mã ping máy chủ (null: ping lỗi — gửi không mã, máy chủ quyết). */
  token: string | null;
  /** Thời điểm của điểm GPS (ms, đồng hồ máy) — tuổi điểm GPS tính lúc gửi. */
  fixAt: number | null;
  mocked: boolean;
}

/**
 * Ping máy chủ rồi lấy điểm GPS MỚI: điểm có trước lần ping (bộ đệm của máy) bị bỏ, thử lại trong `windowMs`
 * (`getPosition` nhận số lần thử để lần sau xin độ chính xác cao hơn). Không có điểm mới → coi như GPS lỗi.
 */
export async function acquireFreshFix(
  ping: () => Promise<string | null>,
  getPosition: (remainingMs: number, attempt: number) => Promise<RawFix>,
  windowMs = GPS_RETRY_WINDOW_MS,
  now: () => number = Date.now,
  sleep?: (ms: number) => Promise<void>,
): Promise<LocationFix> {
  const token = await ping();
  const pingAt = now();
  let attempt = 0;
  const raw = await retryLocation<RawFix>(
    async (remaining) => {
      const fix = await getPosition(remaining, attempt++);
      if (fix.timestamp < pingAt - FIX_CLOCK_SKEW_MS) throw new Error('stale fix');
      return fix;
    },
    windowMs,
    now,
    sleep,
  );
  if (!raw) return { coords: null, unavailable: true, token, fixAt: null, mocked: false };
  return { coords: raw.coords, unavailable: false, token, fixAt: raw.timestamp, mocked: raw.mocked };
}

/** Trường vị trí gửi kèm request chấm công — tuổi điểm GPS tính NGAY lúc gửi. */
export function locationFields(fix: LocationFix, now: number = Date.now()) {
  return {
    latitude: fix.coords?.latitude,
    longitude: fix.coords?.longitude,
    accuracy: fix.coords?.accuracy,
    locationUnavailable: !fix.coords && fix.unavailable,
    locationToken: fix.token ?? undefined,
    locationAgeMs: fix.coords && fix.fixAt != null ? Math.max(0, Math.round(now - fix.fixAt)) : undefined,
    isMockLocation: fix.mocked || undefined,
  };
}

export type LocationFields = ReturnType<typeof locationFields>;

/** Máy chủ báo vị trí đã cũ (mã ping hết hạn / điểm GPS cũ). */
export function isLocationStaleError(err: unknown): boolean {
  return hasApiErrorCode(err, 'Attendance.LocationStale');
}

/**
 * Lấy vị trí mới (`locate`: ping + GPS) rồi gửi; máy chủ báo vị trí cũ thì lấy lại và gửi lại đúng một lần. Trả kết quả
 * kèm vị trí đã gửi thành công.
 */
export async function sendWithFreshLocation<T>(
  locate: () => Promise<LocationFix>,
  send: (fix: LocationFix) => Promise<T>,
): Promise<{ result: T; fix: LocationFix }> {
  const fix = await locate();
  try {
    return { result: await send(fix), fix };
  } catch (err) {
    if (!isLocationStaleError(err)) throw err;
    const again = await locate();
    return { result: await send(again), fix: again };
  }
}

/** Kết quả khác null đầu tiên trong các promise (lỗi coi như null); tất cả null → null. */
export function firstNonNull<T>(promises: Promise<T | null>[]): Promise<T | null> {
  return new Promise((resolve) => {
    let pending = promises.length;
    if (pending === 0) resolve(null);
    const settle = (value: T | null) => {
      if (value != null) resolve(value);
      else if (--pending === 0) resolve(null);
    };
    for (const p of promises) p.then(settle, () => settle(null));
  });
}
