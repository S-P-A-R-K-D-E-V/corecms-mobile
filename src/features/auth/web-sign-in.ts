import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import { DiscoverError, newSsoState, redeemAppHubCode } from 'src/api/app-hub';
import { AUTH_HUB_API } from 'src/services/store-config';
import { setDiscovered, type Pending } from './discovery';

// ----------------------------------------------------------------------
// Google (mọi nền tảng) và Apple trên Android: Google/Apple chỉ cho đăng ký một tên miền web, nên app
// mở trang auth.devbyspark.com/sso/start?app=1 (core-fe SsoStartView), người dùng đăng nhập ở đó,
// trang web đổi credential lấy mã dùng một lần (core-be POST /app-hub/web-handoff) rồi chuyển về
// sparkstore://auth/hub?code=…&state=…. App đổi mã kèm PKCE verifier (POST /app-hub/redeem) lấy danh
// sách cửa hàng như discover. Mã lộ qua deep link vô dụng nếu không có verifier — verifier chỉ nằm
// trong máy (SecureStore, để vẫn đổi được nếu Android dọn app khi đang ở trình duyệt).
//
// iOS: ASWebAuthenticationSession trả URL về thẳng openAuthSessionAsync. Android: deep link mở lại
// app qua intent → expo-router vào src/app/auth/hub.tsx (openAuthSessionAsync thường trả 'dismiss').
// ----------------------------------------------------------------------

export type WebProvider = 'google' | 'apple';

const PKCE_KEY = 'apphub.pkce';
/** Trang web giữ mã 2 phút; chừa thời gian người dùng đăng nhập trên trình duyệt. */
const MAX_AGE_MS = 15 * 60_000;

export const AUTH_WEB_ORIGIN = AUTH_HUB_API.replace(/\/api\/?$/, '');

type SavedPkce = { state: string; verifier: string; provider: WebProvider; at: number };

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += B64URL[n & 63]!;
  }
  return out;
}

/** Deep link trang web chuyển về — scheme của app (core-fe chỉ nhận sparkstore:/corecms:). */
export function hubRedirectUri(): string {
  return Linking.createURL('auth/hub');
}

/**
 * Mở trang đăng nhập web. Trả về {code, state} nếu trình duyệt trả URL về (iOS); null nếu người dùng
 * đóng trình duyệt, hoặc kết quả đi theo deep link tới màn auth/hub (Android).
 */
export async function startWebSignIn(provider: WebProvider, lang: string): Promise<{ code: string; state: string } | null> {
  const verifier = base64Url(Crypto.getRandomBytes(32)); // 43 ký tự
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  const challenge = digest.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const state = newSsoState();
  const saved: SavedPkce = { state, verifier, provider, at: Date.now() };
  await SecureStore.setItemAsync(PKCE_KEY, JSON.stringify(saved));

  const redirectUri = hubRedirectUri();
  const query = [
    'app=1',
    `provider=${provider}`,
    `lang=${lang === 'en' ? 'en' : 'vi'}`,
    `state=${state}`,
    `challenge=${challenge}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
  ].join('&');
  const result = await WebBrowser.openAuthSessionAsync(`${AUTH_WEB_ORIGIN}/sso/start/?${query}`, redirectUri);

  if (result.type !== 'success' || !result.url) return null;
  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  const returnedState = typeof queryParams?.state === 'string' ? queryParams.state : null;
  return code && returnedState ? { code, state: returnedState } : null;
}

const inflight = new Map<string, Promise<Pending>>();

/**
 * Đổi mã từ trang web lấy danh sách cửa hàng (một lần cho mỗi mã — iOS và deep link có thể cùng gọi).
 * state phải khớp phiên đăng nhập app vừa mở, nếu không là link lạ → từ chối.
 */
export function completeWebSignIn(code: string, state: string): Promise<Pending> {
  let job = inflight.get(code);
  if (!job) {
    job = (async () => {
      const raw = await SecureStore.getItemAsync(PKCE_KEY);
      let saved: SavedPkce | null = null;
      try {
        saved = raw ? (JSON.parse(raw) as SavedPkce) : null;
      } catch {
        saved = null;
      }
      if (!saved || saved.state !== state || Date.now() - saved.at > MAX_AGE_MS) {
        throw new DiscoverError('expired_code');
      }
      await SecureStore.deleteItemAsync(PKCE_KEY);
      const result = await redeemAppHubCode(code, state, saved.verifier);
      return setDiscovered(state, saved.provider, result);
    })();
    inflight.set(code, job);
  }
  return job;
}
