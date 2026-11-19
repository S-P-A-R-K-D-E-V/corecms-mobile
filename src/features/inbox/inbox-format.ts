import dayjs from 'dayjs';

import { hasApiErrorCode } from 'src/services/error';
import type {
  ConversationHolder,
  ConversationKind,
  ConversationListFilter,
  ConversationMessage,
  ConversationPage,
  ConversationSummary,
  InboxSummary,
  MessagePage,
  QuickReply,
} from 'src/api/inbox';

// ----------------------------------------------------------------------
// Hộp thư khách — phần thuần (test được): nhãn người giữ, tóm tắt tin cuối, giờ tương đối, cửa sổ 24 giờ của Meta, gộp sự
// kiện trực tiếp vào bộ đệm danh sách / tin, phân loại lỗi máy chủ. Khớp core-fe src/lib/inbox.ts (bản web).
// ----------------------------------------------------------------------

export const INBOX_ROUTE = '/inbox';
export const inboxConversationRoute = (id: string) => `/inbox/${id}`;

export const MESSAGE_MAX_LENGTH = 2000;
export const MESSAGE_MAX_IMAGES = 10;
/** Trả lời công khai dưới bình luận: Facebook chỉ nhận 1 ảnh. */
export const COMMENT_MAX_IMAGES = 1;
export const TAG_MAX_COUNT = 10;
export const TAG_MAX_LENGTH = 30;
/** Hub hỏng → hỏi lại máy chủ mỗi chừng này (danh sách, hội thoại đang mở). */
export const POLL_MS = 20_000;
/** Còn dưới mức này thì cảnh báo cửa sổ 24 giờ. */
export const WINDOW_WARN_MS = 3 * 60 * 60 * 1000;

/** Nhãn "Ưu tiên" (ngôi sao ở menu hội thoại, chip lọc ở danh sách) — trùng bản web. */
export const PRIORITY_TAG = 'Ưu tiên';

export const DEFAULT_FILTER: ConversationListFilter = {
  box: 'all',
  kind: null,
  q: '',
  tag: null,
  unread: false,
  status: 'open',
};

/** Tab trên cùng (kiểu Meta Business Suite): theo loại hội thoại. */
export const KIND_TABS: { key: 'all' | ConversationKind; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'dm', label: 'Tin nhắn' },
  { key: 'comment', label: 'Bình luận' },
];

/** Số chưa đọc của tab loại; máy chủ cũ chưa trả số theo loại → tab "Tất cả" dùng `unread`, hai tab kia không hiện số. */
export function kindUnreadCount(summary: InboxSummary | null | undefined, kind: 'all' | ConversationKind): number {
  if (!summary) return 0;
  const { unreadMessages: m, unreadComments: c } = summary;
  if (kind === 'dm') return m ?? 0;
  if (kind === 'comment') return c ?? 0;
  return m === null && c === null ? summary.unread : (m ?? 0) + (c ?? 0);
}

/** Số trên thẻ trang chủ / ô menu: hội thoại chưa ai nhận + hội thoại chưa đọc (như chấm đỏ trên web). */
export function inboxAttentionCount(summary: InboxSummary | null | undefined): number {
  return summary ? summary.unassigned + summary.unread : 0;
}

// ----------------------------------------------------------------------
// Người giữ hội thoại.

export function isHeldByMe(holder: ConversationHolder, myUserId: string | null | undefined): boolean {
  return holder.type === 'user' && !!myUserId && holder.userId === myUserId;
}

/** Nhân viên khác trong hệ thống đang giữ — gửi / giành bị 409 trừ khi giành bằng quyền quản lý. */
export function isHeldByOther(holder: ConversationHolder, myUserId: string | null | undefined): boolean {
  return holder.type === 'user' && !isHeldByMe(holder, myUserId);
}

/** "Đang do Trà My trả lời" / "Bạn đang trả lời" / "Agent đang trả lời" / "Nhân viên trên Facebook" / "Chưa ai nhận". */
export function holderLabel(holder: ConversationHolder, myUserId?: string | null): string {
  switch (holder.type) {
    case 'agent':
      return 'Agent đang trả lời';
    case 'external':
      return 'Nhân viên trên Facebook';
    case 'user':
      if (isHeldByMe(holder, myUserId)) return 'Bạn đang trả lời';
      return `Đang do ${holder.name?.trim() || 'nhân viên khác'} trả lời`;
    default:
      return 'Chưa ai nhận';
  }
}

export type HolderTone = 'neutral' | 'primary' | 'info' | 'warning' | 'success' | 'error' | 'secondary';

export function holderTone(holder: ConversationHolder, myUserId?: string | null): HolderTone {
  switch (holder.type) {
    case 'agent':
      return 'secondary';
    case 'external':
      return 'warning';
    case 'user':
      return isHeldByMe(holder, myUserId) ? 'success' : 'info';
    default:
      return 'error';
  }
}

export type HolderAction = 'take' | 'force-take' | 'release' | 'to-agent';

/**
 * Nút ở thanh người giữ. Không có quyền trả lời → không nút. Tôi giữ → Trả về hàng chờ + Giao lại cho agent. Người khác giữ →
 * Giành quyền (chỉ người có conversation.manage). Còn lại (chưa ai / agent / Facebook) → Tôi trả lời (+ Giao cho agent khi
 * chưa ai nhận).
 */
export function holderActions(
  holder: ConversationHolder,
  myUserId: string | null | undefined,
  perms: { reply: boolean; manage: boolean }
): HolderAction[] {
  if (!perms.reply) return [];
  if (isHeldByMe(holder, myUserId)) return ['release', 'to-agent'];
  if (isHeldByOther(holder, myUserId)) return perms.manage ? ['force-take'] : [];
  if (holder.type === 'none') return ['take', 'to-agent'];
  return ['take'];
}

// ----------------------------------------------------------------------
// Danh sách.

/** Tin cuối ở danh sách: "Bạn: …" khi tin đi (nhân viên / page / agent), "[Ảnh]" khi không có chữ. */
export function lastMessagePreview(conv: Pick<ConversationSummary, 'lastMessage'>): string {
  const last = conv.lastMessage;
  if (!last) return 'Chưa có tin nhắn';
  const text = last.text?.trim() || '[Ảnh / tệp]';
  return last.direction === 'out' ? `Bạn: ${text}` : text;
}

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** Giờ ở danh sách: "Vừa xong" / "5 phút" / "14:05" (hôm nay) / "Hôm qua" / "T3" (trong tuần) / "12/11". */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const d = dayjs(iso);
  if (!d.isValid()) return '';
  const diff = now - d.valueOf();
  if (diff < 60_000) return 'Vừa xong';
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} phút`;
  const n = dayjs(now);
  if (d.isSame(n, 'day')) return d.format('HH:mm');
  if (d.isSame(n.subtract(1, 'day'), 'day')) return 'Hôm qua';
  if (diff < 7 * 24 * 60 * 60_000) return WEEKDAYS[d.day()]!;
  return d.year() === n.year() ? d.format('DD/MM') : d.format('DD/MM/YY');
}

export function isPriority(conv: Pick<ConversationSummary, 'tags'>): boolean {
  return conv.tags.some((t) => t.toLowerCase() === PRIORITY_TAG.toLowerCase());
}

/** Bỏ khoảng trắng thừa, bỏ trùng (không phân biệt hoa thường), cắt ≤ 30 ký tự, ≤ 10 nhãn. */
export function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of tags) {
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, TAG_MAX_LENGTH).trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key) || result.length >= TAG_MAX_COUNT) continue;
    seen.add(key);
    result.push(tag);
  }
  return result;
}

/** Bật / tắt nhãn "Ưu tiên", giữ các nhãn khác (đủ 10 nhãn thì bỏ nhãn cuối để chừa chỗ). */
export function togglePriorityTag(tags: readonly string[]): string[] {
  const key = PRIORITY_TAG.toLowerCase();
  if (tags.some((t) => t.toLowerCase() === key)) return tags.filter((t) => t.toLowerCase() !== key);
  return normalizeTags([PRIORITY_TAG, ...tags]);
}

/** Hội thoại có thuộc nhóm `box` không (như máy chủ lọc). */
export function matchesBox(conv: ConversationSummary, box: ConversationListFilter['box'], myUserId: string | null | undefined): boolean {
  switch (box) {
    case 'unassigned':
      return conv.holder.type === 'none';
    case 'mine':
      return isHeldByMe(conv.holder, myUserId) || (!!myUserId && conv.assignedUserId === myUserId);
    case 'agent':
      return conv.holder.type === 'agent';
    case 'external':
      return conv.holder.type === 'external';
    default:
      return true;
  }
}

/** Còn khớp bộ lọc không. null = không đoán được ở máy (đang tìm theo chữ / lọc chưa đọc) → giữ chỗ cũ, không tự thêm. */
export function matchesFilter(
  conv: ConversationSummary,
  filter: ConversationListFilter,
  myUserId: string | null | undefined
): boolean | null {
  if (!matchesBox(conv, filter.box, myUserId)) return false;
  if (filter.status !== conv.status) return false;
  if (filter.tag && !conv.tags.some((t) => t.toLowerCase() === filter.tag!.toLowerCase())) return false;
  if (filter.kind && conv.kind !== filter.kind) return false;
  if (filter.q.trim()) return null;
  if (filter.unread && conv.unreadCount <= 0) return null;
  return true;
}

const lastAt = (c: ConversationSummary) => new Date(c.lastMessageAt).getTime() || 0;

/**
 * Gộp một hội thoại vừa đổi (sự kiện conversationUpdated, kết quả Tôi trả lời / nhãn / trạng thái) vào các trang danh sách:
 * còn khớp → thay chỗ cũ hoặc thêm lên đầu, xếp lại theo tin mới nhất; không còn khớp → bỏ ra. Số dòng mỗi trang giữ nguyên
 * (trang đầu +1 khi thêm) để con trỏ `nextBefore` của trang sau vẫn đúng.
 */
export function upsertConversationPages(
  pages: ConversationPage[] | undefined,
  conv: ConversationSummary,
  filter: ConversationListFilter,
  myUserId: string | null | undefined
): ConversationPage[] | undefined {
  if (!pages || pages.length === 0) return pages;
  const match = matchesFilter(conv, filter, myUserId);
  const exists = pages.some((p) => p.items.some((c) => c.id === conv.id));
  if (match === false) {
    if (!exists) return pages;
    return pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== conv.id) }));
  }
  if (match === null && !exists) return pages;
  const all = pages.flatMap((p) => p.items).filter((c) => c.id !== conv.id);
  all.push(conv);
  all.sort((a, b) => lastAt(b) - lastAt(a));
  let offset = 0;
  return pages.map((p, i) => {
    const size = i === pages.length - 1 ? all.length - offset : p.items.length + (i === 0 && !exists ? 1 : 0);
    const items = all.slice(offset, offset + size);
    offset += size;
    return { ...p, items };
  });
}

/** Sửa tại chỗ một hội thoại trong các trang (vd đã đọc → unreadCount 0) mà không xếp lại. */
export function patchConversationPages(
  pages: ConversationPage[] | undefined,
  id: string,
  patch: Partial<ConversationSummary>
): ConversationPage[] | undefined {
  if (!pages) return pages;
  return pages.map((p) => ({ ...p, items: p.items.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

// ----------------------------------------------------------------------
// Tin nhắn — trang 0 = mới nhất; mỗi trang xếp cũ → mới.

export function flattenMessages(pages: MessagePage[] | undefined): ConversationMessage[] {
  if (!pages) return [];
  const result: ConversationMessage[] = [];
  const seen = new Set<string>();
  for (let i = pages.length - 1; i >= 0; i -= 1) {
    for (const m of pages[i]!.items) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      result.push(m);
    }
  }
  return result;
}

export function updateMessageInPages(pages: MessagePage[] | undefined, message: ConversationMessage): MessagePage[] | undefined {
  if (!pages) return pages;
  let changed = false;
  const next = pages.map((p) => {
    if (!p.items.some((m) => m.id === message.id)) return p;
    changed = true;
    return { ...p, items: p.items.map((m) => (m.id === message.id ? message : m)) };
  });
  return changed ? next : pages;
}

/** Thêm tin mới vào trang mới nhất; đã có (hub và kết quả gửi về cùng lúc) thì thay. */
export function addMessageToPages(pages: MessagePage[] | undefined, message: ConversationMessage): MessagePage[] | undefined {
  if (!pages || pages.length === 0) return pages;
  if (pages.some((p) => p.items.some((m) => m.id === message.id))) return updateMessageInPages(pages, message);
  const [first, ...rest] = pages;
  const items = [...first!.items, message].sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  return [{ ...first!, items }, ...rest];
}

export type BubbleKind = 'suggestion' | 'note' | 'out' | 'in' | 'system';

/** Kiểu hiển thị một tin: gợi ý agent (viền xanh + "Dùng gợi ý"), ghi chú nội bộ (vàng), tin đi (xanh phải), tin khách. */
export function bubbleKind(m: Pick<ConversationMessage, 'status' | 'isInternalNote' | 'direction' | 'senderType'>): BubbleKind {
  if (m.status === 'suggested') return 'suggestion';
  if (m.isInternalNote) return 'note';
  if (m.senderType === 'system') return 'system';
  return m.direction === 'out' ? 'out' : 'in';
}

export function senderLabel(m: Pick<ConversationMessage, 'senderType' | 'senderName'>): string {
  const name = m.senderName?.trim();
  switch (m.senderType) {
    case 'agent':
      return name || 'Agent CSKH';
    case 'external':
      return name || 'Nhân viên (trên Facebook)';
    case 'system':
      return name || 'Hệ thống';
    case 'customer':
      return name || 'Khách';
    default:
      return name || 'Nhân viên';
  }
}

/** Dòng nhỏ dưới tin đi: "Người gửi: Trà My". */
export function outgoingSenderCaption(m: Pick<ConversationMessage, 'senderType' | 'senderName'>): string {
  return `Người gửi: ${senderLabel(m)}`;
}

/** Bình luận của khách ẩn / hiện lại được (tin vào, không phải ghi chú, đã nhận hoặc đang ẩn). */
export function canToggleCommentHidden(
  m: Pick<ConversationMessage, 'direction' | 'isInternalNote' | 'status'>,
  kind: ConversationKind | null | undefined
): boolean {
  return kind === 'comment' && m.direction === 'in' && !m.isInternalNote && (m.status === 'received' || m.status === 'hidden');
}

export function maxImagesFor(kind: ConversationKind | null | undefined): number {
  return kind === 'comment' ? COMMENT_MAX_IMAGES : MESSAGE_MAX_IMAGES;
}

/** Link bài Facebook của hội thoại bình luận; null khi không có. */
export function facebookPostUrl(postId: string | null | undefined): string | null {
  const id = postId?.trim();
  return id ? `https://www.facebook.com/${encodeURIComponent(id)}` : null;
}

// ----------------------------------------------------------------------
// Cửa sổ 24 giờ của Meta.

/** "2 giờ 15 phút" / "45 phút" / "dưới 1 phút". */
export function formatDurationVi(ms: number): string {
  if (ms < 60_000) return 'dưới 1 phút';
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} phút`;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

/** Cảnh báo cửa sổ 24 giờ ở ô gõ: null khi không áp / còn nhiều thời gian. */
export function windowWarning(windowEndsAt: string | null | undefined, now: number = Date.now()): string | null {
  if (!windowEndsAt) return null;
  const end = new Date(windowEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  const left = end - now;
  if (left <= 0) return 'Đã quá 24 giờ từ tin cuối của khách — Meta không cho gửi tin thường.';
  return left < WINDOW_WARN_MS ? `Còn ${formatDurationVi(left)} để trả lời (cửa sổ 24 giờ của Meta).` : null;
}

// ----------------------------------------------------------------------
// Mẫu trả lời nhanh.

/** Bỏ dấu tiếng Việt + chữ thường (đ → d). */
export function foldVi(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

/** Mẫu khớp `query` (shortcut / tiêu đề / nội dung), shortcut bắt đầu bằng query đứng trước; trong nhóm theo sortOrder. */
export function filterQuickReplies(replies: readonly QuickReply[], query: string): QuickReply[] {
  const q = foldVi(query.trim().replace(/^\//, ''));
  const bySort = (a: QuickReply, b: QuickReply) => a.sortOrder - b.sortOrder || a.shortcut.localeCompare(b.shortcut);
  if (!q) return [...replies].sort(bySort);
  const prefix: QuickReply[] = [];
  const contains: QuickReply[] = [];
  for (const r of replies) {
    const s = foldVi(r.shortcut);
    if (s.startsWith(q)) prefix.push(r);
    else if (s.includes(q) || foldVi(r.title).includes(q) || foldVi(r.text).includes(q)) contains.push(r);
  }
  return [...prefix.sort(bySort), ...contains.sort(bySort)];
}

/** Chèn mẫu vào ô gõ: ô trống → nội dung mẫu; có chữ → thêm xuống dòng. */
export function applyQuickReplyText(current: string, reply: Pick<QuickReply, 'text'>): string {
  const cur = current.replace(/\s+$/, '');
  return cur ? `${cur}\n${reply.text}` : reply.text;
}

// ----------------------------------------------------------------------
// Lỗi máy chủ.

export type InboxErrorKind =
  | 'held-by-other'
  | 'window-closed'
  | 'agent-off'
  | 'phone-ambiguous'
  | 'private-reply-failed'
  | 'not-supported'
  | 'other';

/** Phân loại lỗi (ProblemDetails có errorCodes); API F5 máy chủ chưa có → lỗi `notSupported` (src/api/inbox.ts). */
export function inboxErrorKind(err: unknown): InboxErrorKind {
  if (hasApiErrorCode(err, 'Conversation.HeldByOther')) return 'held-by-other';
  if (hasApiErrorCode(err, 'Conversation.WindowClosed')) return 'window-closed';
  if (hasApiErrorCode(err, 'Conversation.AgentOff')) return 'agent-off';
  if (hasApiErrorCode(err, 'Customer.PhoneAmbiguous')) return 'phone-ambiguous';
  if (hasApiErrorCode(err, 'Conversation.PrivateReplyFailed')) return 'private-reply-failed';
  if (err && typeof err === 'object' && (err as { notSupported?: unknown }).notSupported === true) return 'not-supported';
  return 'other';
}

export const NOT_SUPPORTED_MESSAGE = 'Máy chủ chưa hỗ trợ thao tác này — cập nhật máy chủ rồi thử lại.';
