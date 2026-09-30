import * as Crypto from 'expo-crypto';

import { AUTH_HUB_API, type StoreProfile } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Bản cửa hàng: đăng nhập MỘT lần (Apple hoặc email + mật khẩu) ở auth.devbyspark.com rồi nhận danh
// sách cửa hàng người dùng là thành viên (core-be AppHubController). Mỗi cửa hàng kèm mã dùng một lần
// (60 giây, gắn với `state` do app sinh) để đổi lấy phiên trên CHÍNH tên miền cửa hàng đó
// (POST https://<cửa hàng>/api/auth/sso/exchange — xem AuthProvider.loginWithDiscoveredStore).
// Dùng fetch riêng, không qua axiosInstance: chưa có cửa hàng/token nào ở bước này.
// ----------------------------------------------------------------------

export type DiscoveredStore = {
  code: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  host: string;
  webOrigin: string;
  apiBase: string;
  role: string;
  locale: string;
  currency: string;
  timezone: string;
  ssoCode: string;
};

export type DiscoverResult = {
  email: string | null;
  displayName: string | null;
  stores: DiscoveredStore[];
};

export type DiscoverRequest =
  | {
      provider: 'apple' | 'google';
      token: string;
      nonce?: string;
      firstName?: string | null;
      lastName?: string | null;
      authorizationCode?: string | null;
    }
  | { email: string; password: string };

export type DiscoverErrorCode =
  | 'invalid_credentials'
  | 'email_not_verified'
  | 'not_active'
  | 'banned'
  | 'invalid_token'
  | 'rate_limited'
  | 'network'
  | 'unknown';

export class DiscoverError extends Error {
  constructor(public readonly code: DiscoverErrorCode, message?: string) {
    super(message ?? code);
  }
}

/** state ngẫu nhiên 32 ký tự [0-9a-f] — gửi kèm lúc discover và lúc đổi mã. */
export function newSsoState(): string {
  return Crypto.randomUUID().replace(/-/g, '');
}

/** Mã lỗi ErrorOr của core-be (ProblemDetails.errors có khoá là mã lỗi) → mã lỗi của app. */
function mapError(status: number, body: any): DiscoverError {
  if (status === 429) return new DiscoverError('rate_limited');
  const codes = Object.keys(body?.errors ?? {});
  const has = (code: string) => codes.includes(code);
  if (has('Auth.InvalidCred')) return new DiscoverError('invalid_credentials');
  if (has('User.EmailNotVerified')) return new DiscoverError('email_not_verified');
  if (has('User.AccountNotActive')) return new DiscoverError('not_active');
  if (has('User.AccountBanned')) return new DiscoverError('banned');
  if (has('Auth.InvalidOAuthToken') || has('Auth.UnsupportedProvider')) return new DiscoverError('invalid_token');
  return new DiscoverError('unknown', body?.title ?? body?.message);
}

export async function discoverStores(state: string, request: DiscoverRequest): Promise<DiscoverResult> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_HUB_API}/app-hub/discover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ state, ...request }),
    });
  } catch {
    throw new DiscoverError('network');
  }

  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* 429/502 có thể không có JSON */
  }
  if (!res.ok) throw mapError(res.status, body);

  return {
    email: body?.email ?? null,
    displayName: body?.displayName ?? null,
    stores: Array.isArray(body?.stores) ? body.stores : [],
  };
}

export function storeProfileOf(store: DiscoveredStore): StoreProfile {
  return {
    code: store.code,
    host: store.host,
    name: store.name,
    logoUrl: store.logoUrl,
    primaryColor: store.primaryColor,
    locale: store.locale,
    currency: store.currency,
    timezone: store.timezone,
    role: store.role,
  };
}
