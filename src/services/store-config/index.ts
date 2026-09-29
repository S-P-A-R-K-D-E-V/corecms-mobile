import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

// ----------------------------------------------------------------------
// Một mã nguồn, hai bản build (app.config.ts, biến APP_VARIANT):
//   cici  → app CiCi như trước: API cố định EXPO_PUBLIC_HOST_API (cici21chualang.vn).
//   store → app trung tính cho cửa hàng SaaS: người dùng nhập mã cửa hàng, API là
//           https://<mã>.devbyspark.com. Mỗi lúc app chỉ gắn với MỘT cửa hàng; đổi cửa hàng thì
//           xoá toàn bộ token của cửa hàng cũ.
// ----------------------------------------------------------------------

export type AppVariant = 'cici' | 'store';

const extra = (Constants.expoConfig?.extra ?? {}) as { appVariant?: AppVariant; appleSignIn?: boolean };

export const APP_VARIANT: AppVariant = extra.appVariant === 'store' ? 'store' : 'cici';
export const isMultiStore = APP_VARIANT === 'store';
export const appleSignInEnabled = !!extra.appleSignIn;

/** Tên hiển thị trong app: bản CiCi giữ nguyên chữ cũ, bản cửa hàng dùng tên app trung tính. */
export const APP_DISPLAY_NAME = isMultiStore ? (Constants.expoConfig?.name ?? 'Cửa hàng') : 'CiCi Internal App';

export const SAAS_ZONE = process.env.EXPO_PUBLIC_SAAS_ZONE ?? 'devbyspark.com';
const FIXED_HOST_API = process.env.EXPO_PUBLIC_HOST_API ?? 'http://localhost:2510';

const STORE_CODE_KEY = 'storeCode';
const AUTH_KEYS = ['accessToken', 'refreshToken', 'sessionToken'];
const STORE_CODE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;

let currentStoreCode: string | null = null;

/** Gốc API hiện tại. Bản CiCi luôn là địa chỉ cố định; bản cửa hàng là tên miền của cửa hàng đã chọn. */
export function getHostApi(): string {
  return isMultiStore && currentStoreCode ? `https://${currentStoreCode}.${SAAS_ZONE}` : FIXED_HOST_API;
}

export function getStoreCode(): string | null {
  return currentStoreCode;
}

export function storeDomain(code = currentStoreCode): string | null {
  return code ? `${code}.${SAAS_ZONE}` : null;
}

/** Đọc mã cửa hàng đã lưu — phải xong TRƯỚC khi AuthProvider gọi API lần đầu. */
export async function loadStoreCode(): Promise<string | null> {
  if (!isMultiStore) return null;
  const saved = await SecureStore.getItemAsync(STORE_CODE_KEY);
  currentStoreCode = normalizeStoreCode(saved);
  return currentStoreCode;
}

/** Chọn/bỏ chọn cửa hàng. Luôn xoá token cũ để không mang phiên của cửa hàng này sang cửa hàng khác. */
export async function setStoreCode(code: string | null): Promise<void> {
  await Promise.all(AUTH_KEYS.map((k) => SecureStore.deleteItemAsync(k)));
  if (code) {
    await SecureStore.setItemAsync(STORE_CODE_KEY, code);
  } else {
    await SecureStore.deleteItemAsync(STORE_CODE_KEY);
  }
  currentStoreCode = code;
}

/** "  TiemTocABC.devbyspark.com " → "tiemtocabc"; không hợp lệ → null. */
export function normalizeStoreCode(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (value.endsWith(`.${SAAS_ZONE}`)) value = value.slice(0, -(SAAS_ZONE.length + 1));
  return STORE_CODE.test(value) ? value : null;
}

export type StoreLookup =
  | { ok: true; code: string; storeName: string | null; logoUrl: string | null }
  | { ok: false; reason: 'invalid' | 'not_found' | 'suspended' | 'network' };

/** Kiểm tra cửa hàng có thật (trang thương hiệu công khai của cửa hàng). */
export async function lookupStore(input: string): Promise<StoreLookup> {
  const code = normalizeStoreCode(input);
  if (!code) return { ok: false, reason: 'invalid' };

  try {
    const res = await fetch(`https://${code}.${SAAS_ZONE}/public/storefront/branding`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { ok: false, reason: 'not_found' };
    if (res.status === 403) return { ok: false, reason: 'suspended' };
    if (!res.ok) return { ok: false, reason: 'network' };
    const data = await res.json();
    return { ok: true, code, storeName: data?.storeName ?? null, logoUrl: data?.logoUrl ?? null };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
