import * as FileSystem from 'expo-file-system/legacy';

import axios, { endpoints } from './axios';
import { HttpStatusError } from './http-status-error';

// ----------------------------------------------------------------------

export type ConversationType = 'Private' | 'Group';

/** BE (System.Text.Json mặc định) từng trả enum dạng SỐ (0=Private, 1=Group);
 *  so sánh `type === 'Group'` khi đó luôn false → avatar/online trong danh
 *  sách không hiện. Chuẩn hoá cả hai dạng số/chuỗi tại một chỗ. */
export function isGroupConversation(type: ConversationType | number | null | undefined): boolean {
  return type === 'Group' || type === 1;
}

export type ConversationSummary = {
  id: string;
  type: ConversationType;
  name: string | null;
  participantIds: string[];
  lastMessagePreview: string | null;
  lastMessageSenderId: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Khác null = hội thoại do hệ thống quản lý: "admin-alerts" (Cảnh báo hệ thống), "agent-admin" (Quản trị – Đội agent). */
  systemKey?: string | null;
};

export type Conversation = {
  id: string;
  type: ConversationType;
  name: string | null;
  participantIds: string[];
  createdById: string;
  systemKey?: string | null;
  lastMessageId?: string | null;
  lastMessagePreview?: string | null;
  lastMessageSenderId?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MessageAttachment = {
  objectKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  kind: 'image' | 'file';
};

export type DirectMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
  attachments?: MessageAttachment[];
  readBy?: { userId: string; readAt: string }[];
  /** Thẻ hành động (phiếu duyệt / việc của đội agent) — null / thiếu với tin thường; `content` vẫn có chữ đầy đủ. */
  card?: MessageCard | null;
};

// Thẻ trong tin của nhóm "Quản trị – Đội agent" — hợp đồng docs/cici/plans/a1-nhom-quan-tri-api-contract.md mục 2.
// Chuỗi lạ (BE thêm loại / nút mới) vẫn giữ để không vỡ; màn chỉ vẽ nút nó biết (message-card.ts).
// A2 (a2-agent-ceo-api-contract.md mục 3): thẻ `confirm` — CEO đề xuất thao tác, người bấm Xác nhận / Huỷ.
export type MessageCardKind = 'approval' | 'task_question' | 'task_failed' | 'task_result' | 'confirm';
export type MessageCardActionKey = 'approve' | 'revise' | 'reject' | 'reply' | 'confirm' | 'cancel' | 'open';

export type MessageCardAction = {
  key: MessageCardActionKey | (string & {});
  label: string;
  /** primary | default | danger. */
  style?: string | null;
};

/** Một thao tác trong thẻ `confirm` (A2) — chỉ dùng để đếm khi hỏi lại "Chạy {n} thao tác này?". */
export type MessageCardOp = {
  /** approve_action | reject_action | stop_task | retry_task | enable_schedule | disable_schedule. */
  type: string;
  refId: string;
  label: string;
};

export type MessageCard = {
  kind: MessageCardKind | (string & {});
  /** approval → id phiếu agent; task_* → id việc của agent; confirm → id đề xuất của CEO. */
  refId: string;
  title: string;
  lines: string[];
  /** Đường dẫn web (/dashboard/...) — app đổi sang màn của app (message-card.cardTargetRoute). */
  link?: string | null;
  /** open | done. */
  status: string;
  statusText?: string | null;
  expiresAt?: string | null;
  actions: MessageCardAction[];
  updatedAt?: string | null;
  /** Thẻ `confirm`: các thao tác sẽ chạy khi Xác nhận (thiếu → không biết số thao tác). */
  ops?: MessageCardOp[];
};

/** Sự kiện SignalR `messageUpdated`: thẻ của một tin đổi trạng thái → thay tại chỗ. */
export type MessageCardUpdate = { id: string; conversationId: string; card: MessageCard | null };

function optString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/**
 * Thẻ từ máy chủ → dạng màn dùng, chịu được thiếu trường: không phải object / thiếu kind hoặc refId → null (hiện như
 * tin chữ thường); lines / actions luôn là mảng (bỏ phần tử hỏng); status thiếu → "open".
 */
export function normalizeMessageCard(raw: unknown): MessageCard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  const kind = optString(c.kind);
  const refId = optString(c.refId);
  if (!kind || !refId) return null;
  // A1 hứa 0–6 dòng; thẻ `confirm` (A2) liệt kê tới 10 thao tác + lý do → nới 12 dòng cho riêng loại này.
  const maxLines = kind === 'confirm' ? 12 : 6;
  const lines = Array.isArray(c.lines)
    ? c.lines.filter((l): l is string => typeof l === 'string' && l.trim() !== '').slice(0, maxLines)
    : [];
  const actions = Array.isArray(c.actions)
    ? c.actions
        .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && !!optString((a as any).key))
        .map((a) => ({
          key: String(a.key),
          label: optString(a.label) ?? String(a.key),
          style: optString(a.style),
        }))
    : [];
  const ops = Array.isArray(c.ops)
    ? c.ops
        .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o))
        .map((o) => ({
          type: typeof o.type === 'string' ? o.type : '',
          refId: typeof o.refId === 'string' ? o.refId : '',
          label: typeof o.label === 'string' ? o.label : '',
        }))
    : undefined;
  return {
    kind,
    refId: refId.trim(),
    title: typeof c.title === 'string' ? c.title : '',
    lines,
    link: optString(c.link),
    status: optString(c.status) ?? 'open',
    statusText: optString(c.statusText),
    expiresAt: optString(c.expiresAt),
    actions,
    updatedAt: optString(c.updatedAt),
    ...(ops ? { ops } : {}),
  };
}

/** Tin từ máy chủ (REST / SignalR): chuẩn hoá `card` (thiếu → null). */
export function normalizeMessage<T extends { card?: unknown }>(raw: T): T & { card: MessageCard | null } {
  return { ...raw, card: normalizeMessageCard(raw?.card) };
}

// Đính kèm qua presigned URL (khớp core-be):
// POST …/attachments/presign {files:[{fileName,contentType,size}]} → {expiresAt, files:[{objectKey,uploadUrl,method,headers,maxBytes}]}
// rồi PUT tệp lên uploadUrl, rồi POST …/messages {content, attachments:[{objectKey,fileName}], clientMessageId}.
export type PresignAttachmentFile = { fileName: string; contentType: string; size: number };

export type PresignedAttachment = {
  objectKey: string;
  uploadUrl: string;
  method?: string;
  headers?: Record<string, string>;
  maxBytes?: number;
};

export type PresignAttachmentsResponse = { expiresAt: string; files: PresignedAttachment[] };

export type OutgoingAttachment = { objectKey: string; fileName: string };

export type InternalUser = {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  online: boolean;
  /** Tài khoản hệ thống "Trợ lý hệ thống" (người gửi tin cảnh báo / thẻ agent) — không phải người để nhắn. */
  isSystem?: boolean;
};

// ----------------------------------------------------------------------

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const res = await axios.get(endpoints.messenger.conversations);
  return res.data;
}

export async function openPrivateConversation(otherUserId: string): Promise<Conversation> {
  const res = await axios.post(endpoints.messenger.openPrivate, { otherUserId });
  return res.data;
}

export async function createGroupConversation(name: string | null, memberIds: string[]): Promise<Conversation> {
  const res = await axios.post(endpoints.messenger.createGroup, { name, memberIds });
  return res.data;
}

export async function addGroupMembers(conversationId: string, memberIds: string[]): Promise<Conversation> {
  const res = await axios.post(endpoints.messenger.members(conversationId), { memberIds });
  return res.data;
}

export async function removeGroupMember(conversationId: string, memberId: string): Promise<Conversation> {
  const res = await axios.delete(endpoints.messenger.member(conversationId, memberId));
  return res.data;
}

export async function fetchMessages(
  conversationId: string,
  opts?: { limit?: number; before?: string }
): Promise<DirectMessage[]> {
  const res = await axios.get(endpoints.messenger.messages(conversationId), {
    params: { limit: opts?.limit ?? 50, before: opts?.before },
  });
  return Array.isArray(res.data) ? res.data.map((m: DirectMessage) => normalizeMessage(m)) : [];
}

export async function sendMessage(conversationId: string, content: string): Promise<DirectMessage> {
  const res = await axios.post(endpoints.messenger.messages(conversationId), { content });
  return res.data;
}

// Interceptor chung chỉ trả body (mất mã trạng thái) → các lệnh đính kèm tự xử lý status, trừ 401 vẫn để
// interceptor làm mới phiên.
const KEEP_STATUS = { validateStatus: (status: number) => status !== 401 };

function unwrap<T>(res: { status: number; data: T }): T {
  if (res.status >= 200 && res.status < 300) return res.data;
  throw new HttpStatusError(res.status, res.data);
}

export async function presignAttachments(
  conversationId: string,
  files: PresignAttachmentFile[]
): Promise<PresignAttachmentsResponse> {
  const res = await axios.post(endpoints.messenger.attachmentsPresign(conversationId), { files }, KEEP_STATUS);
  const data = unwrap<PresignAttachmentsResponse>(res);
  if (!Array.isArray(data?.files) || data.files.length !== files.length) throw new HttpStatusError(502, data);
  return data;
}

/**
 * PUT tệp thẳng lên R2 bằng presigned URL (không qua API, không kèm Authorization). Dùng upload task của
 * expo-file-system để có tiến độ và đọc tệp từ đĩa (không nạp cả tệp vào JS).
 */
export async function uploadToPresignedUrl(
  target: PresignedAttachment,
  file: { uri: string; contentType: string },
  onProgress?: (sent: number, total: number) => void
): Promise<void> {
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(target.headers ?? {})) {
    // Content-Length / Host do hệ điều hành tự đặt; không bao giờ kèm Authorization / Cookie lên R2 (URL đã ký).
    if (!/^(content-length|host|authorization|cookie)$/i.test(k)) headers[k] = v;
  }
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) headers['Content-Type'] = file.contentType;
  const method = (target.method ?? 'PUT').toUpperCase() as 'PUT' | 'POST' | 'PATCH';
  const task = FileSystem.createUploadTask(
    target.uploadUrl,
    file.uri,
    { httpMethod: method, uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers },
    onProgress ? (p) => onProgress(p.totalBytesSent, p.totalBytesExpectedToSend) : undefined
  );
  const res = await task.uploadAsync();
  if (!res) throw new HttpStatusError(0, null); // bị huỷ
  if (res.status < 200 || res.status >= 300) throw new HttpStatusError(res.status, res.body);
}

export async function sendAttachmentMessage(
  conversationId: string,
  body: { content: string; attachments: OutgoingAttachment[]; clientMessageId: string }
): Promise<DirectMessage> {
  const res = await axios.post(endpoints.messenger.messages(conversationId), body, KEEP_STATUS);
  return unwrap<DirectMessage>(res);
}

export async function markRead(conversationId: string): Promise<void> {
  await axios.post(endpoints.messenger.markRead(conversationId));
}

export async function fetchUsers(): Promise<InternalUser[]> {
  const res = await axios.get(endpoints.messenger.users);
  return res.data;
}
