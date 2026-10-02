import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import axiosInstance, { endpoints } from 'src/api/axios';
import { AUTH_WEB_ORIGIN, type WebProvider } from './web-sign-in';

// ----------------------------------------------------------------------
// Liên kết Google (hoặc Apple) cho tài khoản ĐANG đăng nhập — mỗi tài khoản (một email đăng nhập) gắn
// được MỘT Google và MỘT Apple để đăng nhập nhanh; đã có thì BE trả 409 Auth.ProviderAlreadyLinked.
// App không gọi thẳng Google được nên đi qua trang auth:
//  1. Xin vé một lần trên tên miền cửa hàng: POST /auth/oauth-link/start (đã đăng nhập).
//  2. Mở <auth>/sso/start/?link=1&provider=…&app=1&redirect_uri=sparkstore://auth/linked#t=<vé> — vé
//     chỉ đi qua fragment (không lên server, không vào log).
//  3. Trang auth gắn xong chuyển về sparkstore://auth/linked?status=linked&provider=… (iOS: trả thẳng
//     cho openAuthSessionAsync; Android: intent → màn src/app/auth/linked.tsx). Lỗi đã có liên kết cùng
//     loại: …?status=error&provider=…&reason=provider_already_linked.
// ----------------------------------------------------------------------

/** Lý do lỗi trang auth gửi về — chỉ nhận các giá trị đã biết, không bao giờ hiện nguyên văn tham số. */
export type LinkFailureReason = 'provider_already_linked';

export type LinkResult = {
  status: 'linked' | 'error' | 'cancelled';
  provider: string | null;
  reason: LinkFailureReason | null;
};

const KNOWN_REASONS: readonly LinkFailureReason[] = ['provider_already_linked'];
const KNOWN_PROVIDERS: readonly string[] = ['google', 'apple'];

export function linkRedirectUri(): string {
  return Linking.createURL('auth/linked');
}

export function parseLinkResult(params: {
  status?: unknown;
  result?: unknown;
  provider?: unknown;
  reason?: unknown;
}): LinkResult {
  // Trang auth gửi `status`; nhận cả `result` cho chắc.
  const raw = params.status ?? params.result;
  const status = raw === 'linked' || raw === 'cancelled' ? raw : 'error';
  const reason =
    status === 'error' && KNOWN_REASONS.includes(params.reason as LinkFailureReason)
      ? (params.reason as LinkFailureReason)
      : null;
  const provider =
    typeof params.provider === 'string' && KNOWN_PROVIDERS.includes(params.provider.toLowerCase())
      ? params.provider.toLowerCase()
      : null;
  return { status, provider, reason };
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
