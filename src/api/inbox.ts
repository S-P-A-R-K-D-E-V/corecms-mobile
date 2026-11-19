import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// Hộp thư khách (core-be ConversationsController — hợp đồng docs/cici/plans/fb-inbox-api-contract.md, phần F2 + F5).
// Tin nhắn Messenger + bình luận fanpage của khách; nhân viên trả lời từ điện thoại. Dữ liệu từ máy chủ được chuẩn hoá
// (mảng thiếu → [], trường F5 chưa có trên máy chủ → mặc định) để màn không vỡ khi BE chưa lên bản mới.
// ----------------------------------------------------------------------

export type HolderType = 'agent' | 'user' | 'external' | 'none';
export type ConversationStatus = 'open' | 'closed' | 'spam';
export type SenderType = 'customer' | 'agent' | 'user' | 'external' | 'system';
/** dm = tin nhắn Messenger; comment = bình luận trên một bài fanpage (một bài + một người bình luận). */
export type ConversationKind = 'dm' | 'comment';
/** suggested = gợi ý agent soạn cho nhân viên (không gửi khách); hidden = bình luận khách đã bị ẩn trên Facebook. */
export type MessageStatus = 'sending' | 'sent' | 'failed' | 'received' | 'suggested' | 'hidden';

export interface ConversationHolder {
  type: HolderType;
  userId: string | null;
  name: string | null;
  since: string | null;
}

export interface ConversationSummary {
  id: string;
  channelId: string;
  channelName: string;
  platform: string;
  kind: ConversationKind;
  postId: string | null;
  customer: { id: string | null; name: string; avatarUrl: string | null; phone: string | null; code: string | null };
  lastMessage: { text: string; direction: 'in' | 'out'; senderType: SenderType; at: string } | null;
  unreadCount: number;
  status: ConversationStatus;
  holder: ConversationHolder;
  holderVersion: number;
  assignedUserId: string | null;
  assignedName: string | null;
  tags: string[];
  lastCustomerMessageAt: string | null;
  windowEndsAt: string | null;
  lastMessageAt: string;
}

export interface MessageAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'link' | (string & {});
  url: string;
  name: string | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  senderType: SenderType;
  senderName: string | null;
  text: string | null;
  attachments: MessageAttachment[];
  status: MessageStatus | (string & {});
  error: string | null;
  isInternalNote: boolean;
  sentAt: string;
}

export interface CustomerInvoice {
  id: string;
  code: string;
  total: number;
  createdAt: string;
  channel: string | null;
}

export interface CustomerPanel {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  note: string | null;
  source: string | null;
  tags: string[];
  avatarUrl: string | null;
  totalOrders: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  recentInvoices: CustomerInvoice[];
}

export interface ConversationDetail extends ConversationSummary {
  customerPanel: CustomerPanel | null;
  canReply: boolean;
  reason: string | null;
}

export type InboxBox = 'unassigned' | 'mine' | 'agent' | 'external' | 'all';

export interface InboxSummary {
  unassigned: number;
  mine: number;
  agent: number;
  external: number;
  unread: number;
  open: number;
  /** F5 — null khi máy chủ chưa trả (bản cũ): tab không hiện số. */
  unreadMessages: number | null;
  unreadComments: number | null;
}

export interface ConversationPage {
  items: ConversationSummary[];
  nextBefore: string | null;
}

export interface MessagePage {
  items: ConversationMessage[];
  nextBefore: string | null;
}

export interface QuickReply {
  id: string;
  shortcut: string;
  title: string;
  text: string;
  imageUrls: string[];
  sortOrder: number;
}

/** Bộ lọc danh sách (query của GET conversations). */
export interface ConversationListFilter {
  box: InboxBox;
  kind: ConversationKind | null;
  q: string;
  tag: string | null;
  unread: boolean;
  status: ConversationStatus;
}

// ----------------------------------------------------------------------
// Chuẩn hoá.

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function optNum(value: unknown): number | null {
  return value === undefined || value === null ? null : num(value);
}

const HOLDER_TYPES: readonly HolderType[] = ['agent', 'user', 'external', 'none'];
const STATUSES: readonly ConversationStatus[] = ['open', 'closed', 'spam'];

export function normalizeConversation(raw: any): ConversationSummary {
  const c = raw ?? {};
  const h = c.holder ?? {};
  const cu = c.customer ?? {};
  const last = c.lastMessage;
  return {
    id: String(c.id ?? ''),
    channelId: String(c.channelId ?? ''),
    channelName: String(c.channelName ?? ''),
    platform: String(c.platform ?? ''),
    kind: c.kind === 'comment' ? 'comment' : 'dm',
    postId: str(c.postId),
    customer: {
      id: str(cu.id),
      name: String(cu.name ?? '') || 'Khách',
      avatarUrl: str(cu.avatarUrl),
      phone: str(cu.phone),
      code: str(cu.code),
    },
    lastMessage:
      last && typeof last === 'object'
        ? {
            text: String(last.text ?? ''),
            direction: last.direction === 'out' ? 'out' : 'in',
            senderType: (str(last.senderType) ?? 'customer') as SenderType,
            at: String(last.at ?? ''),
          }
        : null,
    unreadCount: num(c.unreadCount),
    status: STATUSES.includes(c.status) ? c.status : 'open',
    holder: {
      type: HOLDER_TYPES.includes(h.type) ? h.type : 'none',
      userId: str(h.userId),
      name: str(h.name),
      since: str(h.since),
    },
    holderVersion: num(c.holderVersion),
    assignedUserId: str(c.assignedUserId),
    assignedName: str(c.assignedName),
    tags: Array.isArray(c.tags) ? c.tags.filter((t: unknown): t is string => typeof t === 'string') : [],
    lastCustomerMessageAt: str(c.lastCustomerMessageAt),
    windowEndsAt: str(c.windowEndsAt),
    lastMessageAt: String(c.lastMessageAt ?? ''),
  };
}

export function normalizeMessage(raw: any): ConversationMessage {
  const m = raw ?? {};
  return {
    id: String(m.id ?? ''),
    conversationId: String(m.conversationId ?? ''),
    direction: m.direction === 'out' ? 'out' : 'in',
    senderType: (str(m.senderType) ?? (m.direction === 'out' ? 'user' : 'customer')) as SenderType,
    senderName: str(m.senderName),
    text: typeof m.text === 'string' ? m.text : null,
    attachments: Array.isArray(m.attachments)
      ? m.attachments
          .filter((a: any) => a && typeof a.url === 'string' && a.url)
          .map((a: any) => ({ type: String(a.type ?? 'file'), url: a.url as string, name: str(a.name) }))
      : [],
    status: String(m.status ?? 'sent'),
    error: str(m.error),
    isInternalNote: m.isInternalNote === true,
    sentAt: String(m.sentAt ?? ''),
  };
}

function normalizePanel(raw: any): CustomerPanel | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id ?? ''),
    code: str(raw.code),
    name: String(raw.name ?? ''),
    phone: str(raw.phone),
    address: str(raw.address),
    note: str(raw.note),
    source: str(raw.source),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((t: unknown): t is string => typeof t === 'string') : [],
    avatarUrl: str(raw.avatarUrl),
    totalOrders: num(raw.totalOrders),
    totalSpent: num(raw.totalSpent),
    lastPurchaseAt: str(raw.lastPurchaseAt),
    recentInvoices: Array.isArray(raw.recentInvoices)
      ? raw.recentInvoices.map((i: any) => ({
          id: String(i?.id ?? ''),
          code: String(i?.code ?? ''),
          total: num(i?.total),
          createdAt: String(i?.createdAt ?? ''),
          channel: str(i?.channel),
        }))
      : [],
  };
}

export function normalizeDetail(raw: any): ConversationDetail {
  return {
    ...normalizeConversation(raw),
    customerPanel: normalizePanel(raw?.customerPanel),
    canReply: raw?.canReply !== false,
    reason: str(raw?.reason),
  };
}

export function normalizeSummary(raw: any): InboxSummary {
  const d = raw ?? {};
  return {
    unassigned: num(d.unassigned),
    mine: num(d.mine),
    agent: num(d.agent),
    external: num(d.external),
    unread: num(d.unread),
    open: num(d.open),
    unreadMessages: optNum(d.unreadMessages),
    unreadComments: optNum(d.unreadComments),
  };
}

/** Tham số GET conversations. Bộ lọc F5 (kind, unread) chỉ gửi khi bật — máy chủ cũ bỏ qua tham số lạ. */
export function listParams(filter: ConversationListFilter, before?: string | null, take = 30): Record<string, string | number> {
  const params: Record<string, string | number> = { status: filter.status, take };
  if (filter.box !== 'all') params.box = filter.box;
  const q = filter.q.trim();
  if (q) params.q = q;
  if (filter.tag) params.tag = filter.tag;
  if (filter.kind) params.kind = filter.kind;
  if (filter.unread) params.unread = 'true';
  if (before) params.before = before;
  return params;
}

// ----------------------------------------------------------------------
// API F5 (ẩn bình luận, nhắn riêng, đánh dấu chưa đọc) có thể chưa có trên máy chủ: route lạ trả 404 / 405 KHÔNG body —
// interceptor chung biến thành chuỗi "Something went wrong" (mất mã HTTP). Nhận 404 / 405 như phản hồi thường để tự phân
// biệt: có body (vd Conversation.NotFound) → ném body kèm status; không body → lỗi { notSupported: true }.

export type NotSupportedError = { status: number; notSupported: true; message: string };

const F5_CONFIG = { validateStatus: (s: number) => (s >= 200 && s < 300) || s === 404 || s === 405 };

export function f5Data(res: { status: number; data: unknown }): unknown {
  if (res.status !== 404 && res.status !== 405) return res.data;
  const body = res.data;
  if (body && typeof body === 'object' && Object.keys(body as object).length > 0) {
    throw { ...(body as object), status: res.status };
  }
  const err: NotSupportedError = { status: res.status, notSupported: true, message: 'Máy chủ chưa hỗ trợ thao tác này.' };
  throw err;
}

// ----------------------------------------------------------------------
// Gọi API.

export async function getInboxSummary(): Promise<InboxSummary> {
  const res = await axios.get<unknown>(endpoints.inbox.summary);
  return normalizeSummary(res.data);
}

export async function getConversations(filter: ConversationListFilter, before?: string | null): Promise<ConversationPage> {
  const res = await axios.get<any>(endpoints.inbox.list, { params: listParams(filter, before) });
  const items = Array.isArray(res.data?.items) ? res.data.items.map(normalizeConversation) : [];
  return { items, nextBefore: str(res.data?.nextBefore) };
}

export async function getConversation(id: string): Promise<ConversationDetail> {
  const res = await axios.get<unknown>(endpoints.inbox.detail(id));
  return normalizeDetail(res.data);
}

/** Một trang tin (cũ → mới); `before` = nextBefore của trang trước để tải tin cũ hơn. */
export async function getMessages(id: string, before?: string | null): Promise<MessagePage> {
  const params: Record<string, string | number> = { take: 50 };
  if (before) params.before = before;
  const res = await axios.get<any>(endpoints.inbox.messages(id), { params });
  const items = Array.isArray(res.data?.items) ? res.data.items.map(normalizeMessage) : [];
  return { items, nextBefore: str(res.data?.nextBefore) };
}

export type SendInput = { text?: string; imageUrls?: string[]; internalNote?: boolean };

export async function sendConversationMessage(id: string, input: SendInput): Promise<ConversationMessage> {
  const res = await axios.post<unknown>(endpoints.inbox.messages(id), input);
  return normalizeMessage(res.data);
}

/** F5: ẩn / hiện bình luận của khách trên Facebook. */
export async function hideComment(id: string, messageId: string, hidden: boolean): Promise<ConversationMessage> {
  const res = await axios.post<unknown>(endpoints.inbox.hide(id, messageId), { hidden }, F5_CONFIG);
  return normalizeMessage(f5Data(res));
}

/** F5: nhắn riêng Messenger cho người bình luận (1 tin / bình luận, trong 7 ngày). */
export async function privateReply(id: string, text: string): Promise<ConversationMessage> {
  const res = await axios.post<unknown>(endpoints.inbox.privateReply(id), { text }, F5_CONFIG);
  return normalizeMessage(f5Data(res));
}

export async function takeConversation(id: string, force = false): Promise<ConversationSummary> {
  const res = await axios.post<unknown>(endpoints.inbox.take(id), { force });
  return normalizeConversation(res.data);
}

export async function releaseConversation(id: string, to: 'agent' | 'none'): Promise<ConversationSummary> {
  const res = await axios.post<unknown>(endpoints.inbox.release(id), { to });
  return normalizeConversation(res.data);
}

export async function markConversationRead(id: string): Promise<void> {
  await axios.post(endpoints.inbox.read(id));
}

/** F5: đánh dấu chưa đọc. */
export async function markConversationUnread(id: string): Promise<void> {
  f5Data(await axios.post<unknown>(endpoints.inbox.unread(id), undefined, F5_CONFIG));
}

export async function setConversationTags(id: string, tags: string[]): Promise<ConversationSummary> {
  const res = await axios.put<unknown>(endpoints.inbox.tags(id), { tags });
  return normalizeConversation(res.data);
}

export async function setConversationStatus(id: string, status: ConversationStatus): Promise<ConversationSummary> {
  const res = await axios.post<unknown>(endpoints.inbox.status(id), { status });
  return normalizeConversation(res.data);
}

export type CustomerUpdateInput = { name?: string; phone?: string; address?: string; note?: string };

export async function updateConversationCustomer(id: string, input: CustomerUpdateInput): Promise<CustomerPanel | null> {
  const res = await axios.put<unknown>(endpoints.inbox.customer(id), input);
  return normalizePanel(res.data);
}

/** Xin URL tải ảnh lên R2 công khai (jpeg / png) → PUT thẳng lên `uploadUrl`, gửi tin kèm `publicUrl`. */
export async function presignConversationImage(
  fileName: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const res = await axios.post<any>(endpoints.inbox.images, { fileName, contentType });
  const uploadUrl = str(res.data?.uploadUrl);
  const publicUrl = str(res.data?.publicUrl);
  if (!uploadUrl || !publicUrl) throw new Error('Máy chủ không trả đường tải ảnh lên.');
  return { uploadUrl, publicUrl };
}

export async function getQuickReplies(): Promise<QuickReply[]> {
  const res = await axios.get<unknown>(endpoints.inbox.quickReplies);
  if (!Array.isArray(res.data)) return [];
  return res.data
    .filter((r: any) => r && typeof r === 'object')
    .map((r: any) => ({
      id: String(r.id ?? ''),
      shortcut: String(r.shortcut ?? ''),
      title: String(r.title ?? ''),
      text: String(r.text ?? ''),
      imageUrls: Array.isArray(r.imageUrls) ? r.imageUrls.filter((u: unknown): u is string => typeof u === 'string') : [],
      sortOrder: Number(r.sortOrder) || 0,
    }));
}
