import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import axiosInstance, { endpoints } from 'src/api/axios';
import { AUTH_WEB_ORIGIN, type WebProvider } from './web-sign-in';

// ----------------------------------------------------------------------
// Liên kết thêm Google (hoặc Apple) cho tài khoản ĐANG đăng nhập — một tài khoản (một email đăng nhập)
// gắn được nhiều Google/Apple để đăng nhập nhanh. App không gọi thẳng Google được nên đi qua trang auth:
//  1. Xin vé một lần trên tên miền cửa hàng: POST /auth/oauth-link/start (đã đăng nhập).
//  2. Mở <auth>/sso/start/?link=1&provider=…&app=1&redirect_uri=sparkstore://auth/linked#t=<vé> — vé
//     chỉ đi qua fragment (không lên server, không vào log).
//  3. Trang auth gắn xong chuyển về sparkstore://auth/linked?status=linked&provider=… (iOS: trả thẳng
//     cho openAuthSessionAsync; Android: intent → màn src/app/auth/linked.tsx).
// ----------------------------------------------------------------------

export type LinkResult = { status: 'linked' | 'error' | 'cancelled'; provider: string | null };

export function linkRedirectUri(): string {
  return Linking.createURL('auth/linked');
}

export function parseLinkResult(params: { status?: unknown; provider?: unknown }): LinkResult {
  const status = params.status === 'linked' || params.status === 'cancelled' ? params.status : 'error';
  return { status, provider: typeof params.provider === 'string' ? params.provider : null };
}

/** null = người dùng đóng trình duyệt, hoặc kết quả đi theo deep link (Android). */
export async function startWebLink(provider: WebProvider, lang: string): Promise<LinkResult | null> {
  const { data } = await axiosInstance.post<{ linkToken: string }>(endpoints.auth.oauthLinkStart);

  const redirectUri = linkRedirectUri();
  const query = [
    'link=1',
    `provider=${provider}`,
    'app=1',
    `lang=${lang === 'en' ? 'en' : 'vi'}`,
    `redirect_uri=${encodeURIComponent(redirectUri)}`,
  ].join('&');
  const result = await WebBrowser.openAuthSessionAsync(
    `${AUTH_WEB_ORIGIN}/sso/start/?${query}#t=${encodeURIComponent(data.linkToken)}`,
    redirectUri
  );

  if (result.type !== 'success' || !result.url) return null;
  return parseLinkResult(Linking.parse(result.url).queryParams ?? {});
}
