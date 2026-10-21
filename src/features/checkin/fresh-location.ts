import * as Location from 'expo-location';

import { locationPing } from 'src/api/attendance';

import { acquireFreshFix, withTimeout, type LocationFix } from './location';

export type LocationPermission = { granted: boolean; canAskAgain: boolean };

/**
 * Vị trí cho MỘT lần gửi chấm công: xin quyền nếu cần, ping máy chủ, rồi lấy điểm GPS mới (thử lại ~5 giây; lần đầu độ
 * chính xác vừa cho nhanh, các lần sau cao để máy đo lại thật). Chưa cho phép / tắt định vị → `blocked` (không chấm
 * công). Không có điểm mới → GPS lỗi (vẫn chấm công, máy chủ đánh dấu "không có vị trí"). Ping lỗi (mạng) → gửi không
 * mã, máy chủ báo vị trí cũ → lấy lại.
 */
export async function locateForAttendance(): Promise<
  LocationFix & { permission: LocationPermission; blocked: 'permission' | 'services' | null }
> {
  let perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
  const permission = { granted: perm.status === 'granted', canAskAgain: perm.canAskAgain };
  const none = { coords: null, unavailable: false, token: null, fixAt: null, mocked: false, permission };
  // Chưa cho phép vị trí / định vị của máy đang tắt → không chấm công được (khác GPS lỗi: vẫn cho, máy chủ đánh dấu).
  if (!permission.granted) return { ...none, blocked: 'permission' };
  if (!(await Location.hasServicesEnabledAsync().catch(() => true))) return { ...none, blocked: 'services' };

  const fix = await acquireFreshFix(
    () =>
      locationPing()
        .then((r) => r.token)
        .catch(() => null),
    async (remaining, attempt) => {
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: attempt === 0 ? Location.Accuracy.Balanced : Location.Accuracy.High }),
        remaining,
      );
      return {
        coords: { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined },
        timestamp: loc.timestamp,
        mocked: !!loc.mocked,
      };
    },
  );
  return { ...fix, permission, blocked: null };
}
