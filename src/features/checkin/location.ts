import type { Coords } from './utils';

// ----------------------------------------------------------------------
// Vị trí khi bấm check-in / check-out: luôn lấy vị trí MỚI; GPS lỗi thì thử lại liên tục trong ~5 giây. Hết 5 giây vẫn
// không được → vẫn cho chấm công, gửi locationUnavailable để máy chủ ghi lần này "không có GPS" cho quản lý xem lại.
// ----------------------------------------------------------------------

/** Thử lại GPS tối đa chừng này trước khi cho chấm công không vị trí. */
export const GPS_RETRY_WINDOW_MS = 5000;
/** Vị trí lấy trong chừng này còn dùng lại được (không bắt lấy lại khi vừa mở màn). */
export const LOCATION_FRESH_MS = 60_000;
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
export async function retryLocation(
  getPosition: (remainingMs: number) => Promise<Coords>,
  windowMs = GPS_RETRY_WINDOW_MS,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<Coords | null> {
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
