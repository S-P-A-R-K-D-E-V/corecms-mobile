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
};

export type Conversation = {
  id: string;
  type: ConversationType;
  name: string | null;
  participantIds: string[];
  createdById: string;
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
};

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
  return res.data;
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
