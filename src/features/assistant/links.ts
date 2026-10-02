import * as WebBrowser from 'expo-web-browser';

import { brand } from 'src/theme';

// ----------------------------------------------------------------------
// Liên kết trong câu trả lời trợ lý: chỉ http(s), mở bằng trình duyệt trong app (như tệp chat —
// ChatDetailScreen openFileInApp). Câu trả lời model là dữ liệu không tin cậy → mọi scheme khác
// (javascript:, tel:, intent:, file:…) chỉ hiện chữ. Tự tách URL bằng regex: URL của RN chưa có hostname.
// ----------------------------------------------------------------------

export type ParsedHttpUrl = { scheme: 'http' | 'https'; host: string };

/** URL tuyệt đối http(s), không userinfo, không khoảng trắng / ký tự điều khiển → {scheme, host}; khác → null. */
export function parseHttpUrl(raw: unknown): ParsedHttpUrl | null {
  if (typeof raw !== 'string') return null;
  const url = raw.trim();
  if (!url || url.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(url)) return null;
  const m = /^(https?):\/\/([^/?#]+)(?:[/?#]|$)/i.exec(url);
  if (!m) return null;
  const authority = m[2]!;
  if (authority.includes('@') || authority.includes('\\')) return null;
  const host = authority.replace(/:\d{1,5}$/, '').toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return null;
  return { scheme: m[1]!.toLowerCase() as 'http' | 'https', host };
}

export function isHttpUrl(raw: unknown): raw is string {
  return parseHttpUrl(raw) !== null;
}

/** Mở link trong trình duyệt của app — bỏ qua mọi thứ không phải http(s). */
export function openInAppBrowser(url: string) {
  if (!isHttpUrl(url)) return;
  WebBrowser.openBrowserAsync(url.trim(), {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    controlsColor: brand.primary,
    toolbarColor: '#FFFFFF',
    enableBarCollapsing: true,
  }).catch(() => {});
}
