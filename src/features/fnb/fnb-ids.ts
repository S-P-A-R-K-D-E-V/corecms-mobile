import * as Crypto from 'expo-crypto';

import { prefs, PrefKeys } from 'src/services/storage';
import { newRequestId } from 'src/features/pos/sale-request';

// ----------------------------------------------------------------------
// Mọi mã do máy sinh cho F&B (contract 1.5): id đơn, id dòng món, id phiếu bar, clientRequestId, deviceId.
// Luôn là uuid chữ thường (expo-crypto, không thêm thư viện native). deviceId sinh MỘT lần cho mỗi lần cài app
// và giữ trên máy — không theo cửa hàng.
// ----------------------------------------------------------------------

/** Uuid mới, chữ thường. Máy không cấp được (hiếm) → cách dự phòng của Bán hàng (uuid v4 tự sinh). */
export function newId(): string {
  try {
    const id = Crypto.randomUUID();
    if (typeof id === 'string' && id) return id.toLowerCase();
  } catch {
    // rơi xuống cách dự phòng
  }
  return newRequestId().toLowerCase();
}

/** Thời điểm ISO-8601 UTC có "Z" và đúng 3 chữ số thập phân (contract 1.2). */
export function isoNow(now: Date = new Date()): string {
  return now.toISOString();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let deviceId: string | null = null;

/** Đọc (hoặc sinh lần đầu) mã máy. Gọi trước khi xếp lệnh ghi; không bao giờ ném lỗi. */
export async function ensureDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  let stored: string | null = null;
  try {
    stored = await prefs.get(PrefKeys.fnbDeviceId);
  } catch {
    // Không đọc được → sinh mã mới (lần sau đọc lại được thì dùng mã đã lưu).
  }
  if (deviceId) return deviceId; // hai lời gọi song song: lời gọi trước đã gán
  if (stored && UUID_RE.test(stored)) {
    deviceId = stored;
  } else {
    deviceId = newId();
    prefs.set(PrefKeys.fnbDeviceId, deviceId).catch(() => {});
  }
  return deviceId;
}

/** Mã máy đã nạp; chưa nạp thì sinh tạm một mã trong bộ nhớ (ensureDeviceId sau đó vẫn ưu tiên mã đã lưu). */
export function currentDeviceId(): string {
  if (!deviceId) {
    deviceId = newId();
    prefs.set(PrefKeys.fnbDeviceId, deviceId).catch(() => {});
  }
  return deviceId;
}

/** Chỉ dùng trong test. */
export function __resetDeviceIdForTest() {
  deviceId = null;
}
