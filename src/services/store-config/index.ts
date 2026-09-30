import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { setStoreCurrency } from 'src/i18n/format';

// ----------------------------------------------------------------------
// Một mã nguồn, hai bản build (app.config.ts, biến APP_VARIANT):
//   cici  → app CiCi như trước: API cố định EXPO_PUBLIC_HOST_API (cici21chualang.vn/api).
//   store → app cửa hàng SaaS (bản toàn cầu): người dùng đăng nhập một lần rồi chọn cửa hàng
//           (app-hub/discover), hoặc nhập mã cửa hàng. Mỗi lúc app chỉ gắn với MỘT cửa hàng:
//             web  https://<host>        (trang đăng nhập web của cửa hàng)
//             API  https://<host>/api    (ingress store-api-<mã> → core-api)
//           Đổi cửa hàng thì xoá toàn bộ token của cửa hàng cũ.
// ----------------------------------------------------------------------

export type AppVariant = 'cici' | 'store';

const extra = (Constants.expoConfig?.extra ?? {}) as { appVariant?: AppVariant; appleSignIn?: boolean };

export const APP_VARIANT: AppVariant = extra.appVariant === 'store' ? 'store' : 'cici';
export const isMultiStore = APP_VARIANT === 'store';
export const appleSignInEnabled = !!extra.appleSignIn;

/** Tên hiển thị trong app: bản CiCi giữ nguyên chữ cũ, bản cửa hàng dùng tên app trung tính. */
export const APP_DISPLAY_NAME = isMultiStore ? (Constants.expoConfig?.name ?? 'Spark Store') : 'CiCi Internal App';

export const SAAS_ZONE = process.env.EXPO_PUBLIC_SAAS_ZONE ?? 'store.devbyspark.com';
/** API đăng nhập một lần của bản cửa hàng (chỉ /app-hub). */
export const AUTH_HUB_API = process.env.EXPO_PUBLIC_AUTH_HUB_API ?? 'https://auth.devbyspark.com/api';
const FIXED_HOST_API = process.env.EXPO_PUBLIC_HOST_API ?? 'http://localhost:2510';
/** Gốc web của bản CiCi = API bỏ đuôi /api. */
const FIXED_WEB_ORIGIN = FIXED_HOST_API.replace(/\/api\/?$/, '');

/** Cửa hàng app đang gắn — đủ để gọi API, hiện thương hiệu và định dạng tiền. */
export type StoreProfile = {
  code: string;
  host: string;
  name: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  locale: string | null;
  currency: string | null;
  timezone: string | null;
  /** Vai trò trong cửa hàng lúc chọn (chỉ để hiển thị; quyền thật theo token). */
  role?: string | null;
};

const STORE_KEY = 'storeProfile';
const LEGACY_CODE_KEY = 'storeCode';
const AUTH_KEYS = ['accessToken', 'refreshToken', 'sessionToken', 'assistantSessionId'];
const STORE_CODE = /^[a-z0-9](?:[a-z0-9-]{1,30})[a-z0-9]$/;
const HOST = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/;

let current: StoreProfile | null = null;

/** Gốc API hiện tại. Bản CiCi luôn là địa chỉ cố định; bản cửa hàng là https://<cửa hàng>/api. */
export function getHostApi(): string {
  return isMultiStore && current ? `https://${current.host}/api` : FIXED_HOST_API;
}

/** Gốc web (trang đăng nhập web, ảnh công khai…). */
export function getWebOrigin(): string {
  return isMultiStore && current ? `https://${current.host}` : FIXED_WEB_ORIGIN;
}

export function getStore(): StoreProfile | null {
  return current;
}

export function getStoreCode(): string | null {
  return current?.code ?? null;
}

export function storeDomain(): string | null {
  return current?.host ?? null;
}

function applyFormat(profile: StoreProfile | null) {
  setStoreCurrency(isMultiStore ? profile?.currency : 'VND');
}

/** Đọc cửa hàng đã lưu — phải xong TRƯỚC khi AuthProvider gọi API lần đầu. */
export async function loadStore(): Promise<StoreProfile | null> {
  if (!isMultiStore) {
    applyFormat(null);
    return null;
  }

  const saved = await SecureStore.getItemAsync(STORE_KEY);
  if (saved) {
    try {
      current = sanitize(JSON.parse(saved));
    } catch {
      current = null;
    }
  } else {
    // Bản build trước chỉ lưu mã cửa hàng.
    const code = normalizeStoreCode(await SecureStore.getItemAsync(LEGACY_CODE_KEY));
    current = code ? profileFromCode(code) : null;
    if (current) await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(current));
  }
  applyFormat(current);
  return current;
}

/** @deprecated giữ tên cũ cho chỗ gọi hiện có. */
export const loadStoreCode = async () => (await loadStore())?.code ?? null;

/** Chọn/bỏ chọn cửa hàng. Luôn xoá token cũ để không mang phiên của cửa hàng này sang cửa hàng khác. */
export async function setStore(profile: StoreProfile | null): Promise<void> {
  await Promise.all(AUTH_KEYS.map((k) => SecureStore.deleteItemAsync(k)));
  await SecureStore.deleteItemAsync(LEGACY_CODE_KEY);
  const clean = profile ? sanitize(profile) : null;
  if (clean) {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(clean));
  } else {
    await SecureStore.deleteItemAsync(STORE_KEY);
  }
  current = clean;
  applyFormat(current);
}

/** Cập nhật thông tin hiển thị (tên, logo…) của cửa hàng đang gắn — KHÔNG đụng token. */
export async function updateStoreDetails(patch: Partial<Omit<StoreProfile, 'code' | 'host'>>): Promise<void> {
  if (!current) return;
  current = { ...current, ...patch };
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(current));
  applyFormat(current);
}

/** @deprecated dùng setStore. */
export async function setStoreCode(code: string | null): Promise<void> {
  const normalized = normalizeStoreCode(code);
  await setStore(normalized ? profileFromCode(normalized) : null);
}

function profileFromCode(code: string): StoreProfile {
  return {
    code,
    host: `${code}.${SAAS_ZONE}`,
    name: null,
    logoUrl: null,
    primaryColor: null,
    locale: null,
    currency: null,
    timezone: null,
  };
}

/** Chỉ nhận host hợp lệ — host đi thẳng vào URL gọi API. */
function sanitize(value: any): StoreProfile | null {
  if (!value || typeof value !== 'object') return null;
  const host = typeof value.host === 'string' ? value.host.trim().toLowerCase() : '';
  const code = typeof value.code === 'string' ? value.code.trim().toLowerCase() : '';
  if (!HOST.test(host) || !code) return null;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    code,
    host,
    name: str(value.name),
    logoUrl: str(value.logoUrl),
    primaryColor: str(value.primaryColor),
    locale: str(value.locale),
    currency: str(value.currency),
    timezone: str(value.timezone),
    role: str(value.role),
  };
}

/** "  TiemTocABC.store.devbyspark.com " → "tiemtocabc"; không hợp lệ → null. */
export function normalizeStoreCode(input: string | null | undefined): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (value.endsWith(`.${SAAS_ZONE}`)) value = value.slice(0, -(SAAS_ZONE.length + 1));
  return STORE_CODE.test(value) ? value : null;
}

export type StoreLookup =
  | { ok: true; profile: StoreProfile }
  | { ok: false; reason: 'invalid' | 'not_found' | 'suspended' | 'network' };

/** Kiểm tra cửa hàng có thật (thương hiệu công khai của cửa hàng qua /api). */
export async function lookupStore(input: string): Promise<StoreLookup> {
  const code = normalizeStoreCode(input);
  if (!code) return { ok: false, reason: 'invalid' };

  const profile = profileFromCode(code);
  try {
    const res = await fetch(`https://${profile.host}/api/public/storefront/branding`, {
      headers: { Accept: 'application/json' },
    });
    if (res.status === 404) return { ok: false, reason: 'not_found' };
    if (res.status === 403) return { ok: false, reason: 'suspended' };
    if (!res.ok) return { ok: false, reason: 'network' };
    const data = await res.json();
    return {
      ok: true,
      profile: {
        ...profile,
        name: data?.storeName ?? null,
        logoUrl: data?.logoUrl ?? null,
        primaryColor: data?.primaryColor ?? null,
        locale: data?.locale ?? null,
        currency: data?.currency ?? null,
        timezone: data?.timezone ?? null,
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
