import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { setStoreCurrency } from 'src/i18n/format';
import { applyBrandColor } from 'src/theme/brand-color';

// ----------------------------------------------------------------------
// Một mã nguồn, hai bản build (app.config.ts, biến APP_VARIANT):
//   cici  → app CiCi như trước: API cố định EXPO_PUBLIC_HOST_API (cici21chualang.vn/api).
//   store → app cửa hàng SaaS (bản toàn cầu): người dùng đăng nhập một lần rồi chọn cửa hàng
//           (app-hub/discover), hoặc nhập mã cửa hàng. Mỗi lúc app chỉ gắn với MỘT cửa hàng:
//             web  https://<host>        (trang đăng nhập web của cửa hàng)
//             API  https://<host>/api    (ingress store-api-<mã> → core-api)
//           Đổi cửa hàng thì xoá toàn bộ token của cửa hàng cũ.
// Cửa hàng đã nhớ = cửa hàng VÀO GẦN NHẤT. Đăng xuất, hết phiên, bấm "Đổi cửa hàng" đều KHÔNG quên nó:
// mở app lại là về đúng trang đăng nhập của cửa hàng đó. Chỉ thay khi thật sự vào cửa hàng khác
// (setStore), và chỉ quên hẳn khi xoá tài khoản (forgetStore).
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
  // Màu chính theo cửa hàng (TenantBranding.PrimaryColor); CiCi / chưa chọn cửa hàng: hồng CiCi.
  applyBrandColor(isMultiStore ? profile?.primaryColor : null);
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

type BeforeStoreChange = (next: StoreProfile, previous: StoreProfile) => Promise<unknown> | unknown;

const beforeStoreChange = new Set<BeforeStoreChange>();

/**
 * Việc phải làm với cửa hàng ĐANG gắn ngay trước khi sang cửa hàng khác — lúc gốc API vẫn là cửa hàng cũ và token
 * của nó còn trong máy (vd. huỷ đăng ký push ở cửa hàng cũ). Lỗi không chặn việc đổi cửa hàng (việc tự giới hạn
 * thời gian chờ). Trả về hàm gỡ đăng ký.
 */
export function onBeforeStoreChange(listener: BeforeStoreChange): () => void {
  beforeStoreChange.add(listener);
  return () => {
    beforeStoreChange.delete(listener);
  };
}

/**
 * Vào (gắn) một cửa hàng — thay cửa hàng đã nhớ. Luôn xoá token cũ để không mang phiên của cửa hàng này
 * sang cửa hàng khác. Thông tin cửa hàng không hợp lệ → báo lỗi, KHÔNG đụng gì (cửa hàng cũ vẫn nhớ).
 */
export async function setStore(profile: StoreProfile): Promise<void> {
  const clean = sanitize(profile);
  if (!clean) throw new Error('store-config: thông tin cửa hàng không hợp lệ');
  const previous = current;
  if (previous && previous.code !== clean.code) {
    await Promise.all(
      [...beforeStoreChange].map((listener) => Promise.resolve().then(() => listener(clean, previous)).catch(() => {}))
    );
  }
  await Promise.all(AUTH_KEYS.map((k) => SecureStore.deleteItemAsync(k)));
  await SecureStore.deleteItemAsync(LEGACY_CODE_KEY);
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(clean));
  current = clean;
  applyFormat(current);
}

/** Quên hẳn cửa hàng + mọi token (chỉ dùng khi xoá tài khoản) — lần mở sau về màn Chào mừng. */
export async function forgetStore(): Promise<void> {
  // Bỏ cửa hàng trong bộ nhớ trước mọi await: màn nào render giữa chừng cũng thấy "chưa có cửa hàng".
  current = null;
  await Promise.all(AUTH_KEYS.map((k) => SecureStore.deleteItemAsync(k)));
  await SecureStore.deleteItemAsync(LEGACY_CODE_KEY);
  await SecureStore.deleteItemAsync(STORE_KEY);
  applyFormat(current);
}

/** Danh sách cửa hàng với cửa hàng đã nhớ (vào gần nhất) lên đầu; thứ tự còn lại giữ nguyên. */
export function lastStoreFirst<T extends { code: string }>(stores: readonly T[]): T[] {
  const last = current?.code;
  if (!last) return [...stores];
  const index = stores.findIndex((s) => s.code.toLowerCase() === last);
  if (index <= 0) return [...stores];
  return [stores[index]!, ...stores.slice(0, index), ...stores.slice(index + 1)];
}

/** Cập nhật thông tin hiển thị (tên, logo…) của cửa hàng đang gắn — KHÔNG đụng token. */
export async function updateStoreDetails(patch: Partial<Omit<StoreProfile, 'code' | 'host'>>): Promise<void> {
  if (!current) return;
  current = { ...current, ...patch };
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(current));
  applyFormat(current);
}

/** @deprecated dùng setStore. */
export async function setStoreCode(code: string): Promise<void> {
  const normalized = normalizeStoreCode(code);
  if (!normalized) throw new Error('store-config: mã cửa hàng không hợp lệ');
  await setStore(profileFromCode(normalized));
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
  | { ok: false; reason: 'invalid' | 'not_found' | 'suspended' | 'rate_limited' | 'network' };

/** Có dáng tên miền / link (có dấu chấm, không khoảng trắng) — tra qua app-hub thay vì coi là mã. */
const LOOKS_LIKE_ADDRESS = /^(?:[a-z][a-z0-9+.-]*:\/\/)?[^\s/?#]+\.[^\s/?#]+/i;

/**
 * Kiểm tra cửa hàng có thật. Mã (hoặc <mã>.<vùng SaaS>): đọc thương hiệu công khai trên chính tên miền
 * cửa hàng. Tên miền khác (tên miền riêng, vùng cũ devbyspark.com, dán nguyên link): hỏi
 * auth hub /app-hub/resolve — trả mã + tên miền vùng SaaS của cửa hàng (nơi có /api).
 */
export async function lookupStore(input: string): Promise<StoreLookup> {
  const code = normalizeStoreCode(input);
  if (!code) {
    return LOOKS_LIKE_ADDRESS.test(input.trim()) ? resolveViaHub(input.trim()) : { ok: false, reason: 'invalid' };
  }

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

async function resolveViaHub(address: string): Promise<StoreLookup> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_HUB_API}/app-hub/resolve?q=${encodeURIComponent(address)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (res.status === 404) return { ok: false, reason: 'not_found' };
  if (res.status === 409) return { ok: false, reason: 'suspended' };
  if (res.status === 429) return { ok: false, reason: 'rate_limited' };
  if (!res.ok) return { ok: false, reason: 'network' };

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: 'network' };
  }
  const profile = sanitize(data);
  return profile ? { ok: true, profile } : { ok: false, reason: 'network' };
}
