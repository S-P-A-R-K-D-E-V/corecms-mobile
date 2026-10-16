import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

import { getStoreCode } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Chế độ máy quầy: POS / tablet ghép với một chi nhánh (POST /counter-devices). Máy giữ key thiết bị (SecureStore),
// mở app là màn chọn nhân viên có ca hôm nay; nhân viên đăng nhập bằng mã 6 số đẩy về app điện thoại của mình.
// Đăng xuất chỉ về màn chọn nhân viên — máy vẫn là máy quầy cho tới khi chủ cửa hàng / quản lý thoát chế độ này.
// Máy quầy KHÔNG đăng ký nhận thông báo đẩy cho người đang dùng (mã đăng nhập của họ không được hiện trên quầy).
// ----------------------------------------------------------------------

const KEY = 'counterDeviceKey';
const INFO = 'counterDevice';

export type CounterDevice = {
  deviceId: string;
  deviceName: string;
  branchId: string;
  branchName: string;
  /** Máy quầy thuộc cửa hàng nào — đổi cửa hàng là thôi chế độ máy quầy. */
  storeCode: string | null;
};

type State = { hydrated: boolean; device: CounterDevice | null };

export const useCounterMode = create<State>(() => ({ hydrated: false, device: null }));

/** Đọc chế độ máy quầy đã lưu (một lần lúc mở app). */
export async function hydrateCounterMode(): Promise<void> {
  try {
    const [raw, key] = await Promise.all([SecureStore.getItemAsync(INFO), SecureStore.getItemAsync(KEY)]);
    const device = raw && key ? (JSON.parse(raw) as CounterDevice) : null;
    // Máy đã chuyển sang cửa hàng khác (không qua màn máy quầy): key cũ không dùng được ở cửa hàng mới.
    const valid = device && device.storeCode === getStoreCode() ? device : null;
    useCounterMode.setState({ hydrated: true, device: valid });
  } catch {
    useCounterMode.setState({ hydrated: true, device: null });
  }
}

export function getCounterDevice(): CounterDevice | null {
  return useCounterMode.getState().device;
}

export function isCounterMode(): boolean {
  return getCounterDevice() != null;
}

export async function getCounterKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEY);
}

export async function enterCounterMode(device: CounterDevice, deviceKey: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, deviceKey);
  await SecureStore.setItemAsync(INFO, JSON.stringify(device));
  useCounterMode.setState({ hydrated: true, device });
}

export async function leaveCounterMode(): Promise<void> {
  await Promise.all([SecureStore.deleteItemAsync(KEY), SecureStore.deleteItemAsync(INFO)]);
  useCounterMode.setState({ hydrated: true, device: null });
}

/** Hết hạn access token (giây, theo claim exp) — phiên máy quầy cố định nên exp chính là lúc hết phiên. */
export function tokenExpiresAt(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null;
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(globalThis.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}
