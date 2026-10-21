import * as Location from 'expo-location';

import type { RawFix } from './location';

// ----------------------------------------------------------------------
// Luồng GPS liên tục khi đang ở màn chấm công (watchPositionAsync, độ chính xác cao, ~1 giây / điểm).
//
// Vì sao: lấy vị trí kiểu một lần (getCurrentPositionAsync) máy hay trả điểm cũ trong bộ đệm — sau một lúc không dùng GPS,
// mọi điểm trả về đều có trước lần ping nên bị bỏ, 5 giây sau app báo "GPS lỗi" và chấm công không vị trí (chủ báo
// 2026-10-21: check-in ngoài giờ 3 lần không GPS trong khi check-out ngay sau đó vẫn có). Giữ GPS chạy suốt lúc ở màn
// chấm công thì lúc gửi chỉ cần chờ điểm mới sau ping (thường dưới 1–2 giây). Rời màn / app xuống nền thì tắt.
// Nhiều nơi cùng giữ (màn chấm công + lần gửi) → đếm người dùng, hết người dùng mới tắt.
// ----------------------------------------------------------------------

type Subscription = { remove: () => void };
type Watch = (onFix: (fix: RawFix) => void) => Promise<Subscription>;

const defaultWatch: Watch = (onFix) =>
  Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
    (loc) =>
      onFix({
        coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined },
        timestamp: loc.timestamp,
        mocked: !!loc.mocked,
      }),
  );

export function createLocationStream(watch: Watch = defaultWatch) {
  let users = 0;
  let sub: Subscription | null = null;
  let starting: Promise<void> | null = null;
  let latest: RawFix | null = null;
  const listeners = new Set<(fix: RawFix) => void>();

  function onFix(fix: RawFix) {
    latest = fix;
    listeners.forEach((l) => l(fix));
  }

  async function ensureRunning() {
    if (sub || starting) return starting ?? undefined;
    starting = watch(onFix)
      .then((s) => {
        // Đã thả hết trong lúc đang khởi động → tắt ngay.
        if (users === 0) s.remove();
        else sub = s;
      })
      .catch(() => {})
      .finally(() => {
        starting = null;
      });
    return starting;
  }

  return {
    /** Giữ luồng GPS (bật nếu chưa chạy). Gọi release() khi xong. */
    async acquire(): Promise<void> {
      users += 1;
      await ensureRunning();
    },
    release(): void {
      users = Math.max(0, users - 1);
      if (users === 0 && sub) {
        sub.remove();
        sub = null;
      }
    },
    latest(): RawFix | null {
      return latest;
    },
    /** Điểm theo dõi được (qua listener) — cho màn hiện vị trí trực tiếp. */
    subscribe(listener: (fix: RawFix) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Chờ điểm GPS có thời điểm ≥ `since` (ms, đồng hồ máy), tối đa `timeoutMs`; không có → null. */
    nextFixSince(since: number, timeoutMs: number): Promise<RawFix | null> {
      if (latest && latest.timestamp >= since) return Promise.resolve(latest);
      return new Promise((resolve) => {
        const done = (fix: RawFix | null) => {
          clearTimeout(timer);
          listeners.delete(listener);
          resolve(fix);
        };
        const listener = (fix: RawFix) => {
          if (fix.timestamp >= since) done(fix);
        };
        const timer = setTimeout(() => done(null), Math.max(0, timeoutMs));
        listeners.add(listener);
      });
    },
    /** Đang có ai giữ luồng không (test). */
    get active(): boolean {
      return users > 0;
    },
  };
}

/** Luồng GPS dùng chung của app. */
export const locationStream = createLocationStream();
