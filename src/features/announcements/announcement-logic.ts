import { notificationAppRoute, notificationWebUrl } from 'src/services/notification-links';
import { pushDataRecord } from 'src/services/push-store';
import { parseInline, parseMarkdown, type MdBlock, type Span } from 'src/features/assistant/RichText';
import type { IPendingAnnouncement } from 'src/api/announcements';

// ----------------------------------------------------------------------
// Phần thuần của popup thông báo trên app (test được).
// ----------------------------------------------------------------------

/** Giãn cách giữa hai lần hỏi API khi quay lại app. */
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function shouldCheck(lastCheckAt: number, now: number): boolean {
  return lastCheckAt === 0 || now - lastCheckAt >= CHECK_INTERVAL_MS;
}

/** Thêm thông báo mới vào cuối hàng đợi, không đảo thứ tự cái đang hiện, không thêm lại cái vừa xử lý xong. */
export function mergeQueue(
  queue: IPendingAnnouncement[],
  incoming: IPendingAnnouncement[],
  handled: ReadonlySet<string>
): IPendingAnnouncement[] {
  const known = new Set(queue.map((a) => a.id));
  return [...queue, ...incoming.filter((a) => !known.has(a.id) && !handled.has(a.id))];
}

/** Push của popup thông báo (core-be AnnouncementHandlers: data.type "announcement"). */
export function isAnnouncementPush(data: unknown): boolean {
  return pushDataRecord(data).type === 'announcement';
}

export type AnnouncementCta = { kind: 'app'; route: string } | { kind: 'web'; url: string };

/**
 * Nút hành động trên app. Backend chỉ nhận đường dẫn web nội bộ: trang có màn trên app thì mở màn đó, không có thì mở trên web của cửa
 * hàng. Đường dẫn ngoài /dashboard, hoặc không biết gốc web, thì ẩn nút.
 */
export function announcementCta(
  ctaUrl: string | null | undefined,
  webOrigin: string | null | undefined
): AnnouncementCta | null {
  const route = notificationAppRoute(ctaUrl);
  if (route) return { kind: 'app', route };
  const url = notificationWebUrl(ctaUrl, webOrigin);
  return url ? { kind: 'web', url } : null;
}

/** Tỉ lệ khung tạm khi ảnh chưa tải xong. */
export const FALLBACK_IMAGE_RATIO = 16 / 9;

/** Rộng / cao để ảnh rộng bằng khung mà không cắt. Kích thước lạ thì null. */
export function imageRatio(width: number | undefined, height: number | undefined): number | null {
  return width && height && width > 0 && height > 0 ? width / height : null;
}

/** Chiều cao tối đa vùng cuộn: có ảnh thì rộng hơn để đọc ảnh dài, vẫn chừa chỗ cho tiêu đề và nút. */
export function scrollMaxHeight(screenHeight: number, hasImage: boolean): number {
  return screenHeight * (hasImage ? 0.6 : 0.5);
}

/** Có nút "Xem chi tiết" khi có ảnh, hoặc khi nội dung dài hơn khung popup. */
export function needsDetail(hasImage: boolean, contentHeight: number, viewportHeight: number): boolean {
  return hasImage || (viewportHeight > 0 && contentHeight > viewportHeight + 1);
}

const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;

/** Nội dung → các khối. React Native không dựng HTML nên thẻ HTML thô bị bỏ cho giống web. */
export function announcementBlocks(markdown: string): MdBlock[] {
  return parseMarkdown(markdown.replace(HTML_TAG, ''));
}

/** Chữ trong nội dung thông báo không có link bấm được: giống web, link ngoài hiện như chữ thường. */
export function plainSpans(text: string): Span[] {
  return parseInline(text).map(({ link: _link, ...span }) => span);
}
