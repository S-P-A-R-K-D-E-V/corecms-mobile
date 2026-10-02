import axios, { endpoints } from './axios';
import { HttpStatusError } from './http-status-error';
import type { PresignedTarget } from './presigned-upload';

// ----------------------------------------------------------------------
// AI Chat trợ lý (khác hoàn toàn với tab "Chat" nhắn tin nội bộ ở
// src/api/messenger.ts). Endpoint dùng chung cho mọi role — BE tự phân
// luồng Admin/Staff/CustomerSupport theo JWT của người gọi
// (ChatContextService.ResolveCustomerAsync), client không cần biết/chọn
// agent. Câu trả lời stream qua SignalR hub /hubs/chat, không phải REST
// polling — xem src/components/assistant/assistant-provider.tsx.
//
// Tin nhắn v1 (core-be ASSISTANT CHAT v1): thêm v/status/errorCode/blocks/steps/attachments — mọi trường
// đều tuỳ chọn, server cũ không gửi thì app hiển thị như trước (chỉ markdown).
// ----------------------------------------------------------------------

export type AssistantMessageRole = 'user' | 'assistant' | 'system';

export type AssistantSession = {
  sessionId: string;
  ownerType: string;
  agent: string;
  tier?: string | null;
  displayName?: string | null;
  expiresAt: string;
  createdAt: string;
};

/** pending = đang trả lời; complete; error = lỗi giữa chừng (giữ phần đã trả lời). null ở tin cũ = complete. */
export type AssistantMessageStatus = 'pending' | 'complete' | 'error';

export type AssistantErrorCode = 'gateway_error' | 'timeout' | 'unavailable' | 'internal';

/** Một bước tra cứu (gọi công cụ) của trợ lý — sự kiện `step`, cập nhật theo id. */
export type AssistantStep = {
  id: string;
  kind?: string;
  name?: string;
  label?: string;
  state: 'running' | 'done' | 'error';
};

/** Ảnh người dùng gửi kèm — url là đường dẫn media tương đối đã ký (hiển thị qua getStorageUrl). */
export type AssistantAttachment = {
  kind: 'image' | string;
  url: string;
  contentType?: string;
  sizeBytes?: number;
};

export type AssistantSuggestion = { label: string; prompt?: string };

export type AssistantImageBlock = { type: 'image'; url?: string; objectKey?: string; alt?: string };
export type AssistantLinkBlock = { type: 'link'; url: string; title?: string };
export type AssistantNavigateAction = {
  type: 'action';
  kind: 'navigate';
  id?: string;
  label: string;
  route: string;
  params?: Record<string, string>;
};
export type AssistantToolAction = {
  type: 'action';
  kind: 'tool';
  id?: string;
  label: string;
  prompt: string;
  confirm?: { title?: string; message?: string };
};
export type AssistantSuggestionsBlock = { type: 'suggestions'; items: AssistantSuggestion[] };

/** Khối có cấu trúc kèm câu trả lời — server đã kiểm, app vẫn kiểm lại (features/assistant/blocks.ts). */
export type AssistantBlock =
  | AssistantImageBlock
  | AssistantLinkBlock
  | AssistantNavigateAction
  | AssistantToolAction
  | AssistantSuggestionsBlock;

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
  fromCache?: boolean;
  v?: number | null;
  status?: AssistantMessageStatus | null;
  errorCode?: AssistantErrorCode | string | null;
  /** Thô từ server (unknown[]): chỉ hiển thị sau khi qua normalizeBlocks. */
  blocks?: unknown[] | null;
  steps?: AssistantStep[] | null;
  attachments?: AssistantAttachment[] | null;
};

/** GET /chatbot/capabilities — server cũ không có (404) → null, app giữ cách chặn cũ, không có nút đính kèm. */
export type AssistantCapabilities = {
  v?: number;
  enabled: boolean;
  reason?: 'not_configured' | 'feature_off' | 'role_not_allowed' | 'sign_in_required' | string | null;
  tier?: 'cici_admin' | 'cici_staff' | 'cici_customer' | 'store_admin' | 'store_manager' | 'none' | string;
  storeName?: string | null;
  imageInput?: boolean;
  maxImages?: number;
  maxImageBytes?: number;
  imageTypes?: string[];
};

export type PresignImageFile = { fileName: string; contentType: string; sizeBytes: number };

export type SendAssistantMessageResult = {
  messageId: string;
  assistantMessageId: string;
  fromCache: boolean;
  cachedAnswer?: string | null;
};

// Interceptor chung chỉ trả body (mất mã trạng thái) → lệnh nào cần phân biệt 404/409/413/415 tự giữ status,
// trừ 401 vẫn để interceptor làm mới phiên (giống messenger.ts).
const KEEP_STATUS = { validateStatus: (status: number) => status !== 401 };

function unwrap<T>(res: { status: number; data: T }): T {
  if (res.status >= 200 && res.status < 300) return res.data;
  throw new HttpStatusError(res.status, res.data);
}

/** newSession: luôn tạo phiên mới ("Cuộc trò chuyện mới") — server cũ bỏ qua cờ này. */
export async function startOrResumeSession(
  sessionId?: string,
  opts?: { newSession?: boolean; displayName?: string }
): Promise<AssistantSession> {
  const res = await axios.post(endpoints.chatbot.sessions, {
    sessionId,
    displayName: opts?.displayName,
    ...(opts?.newSession ? { newSession: true } : {}),
  });
  return res.data;
}

export async function fetchCapabilities(): Promise<AssistantCapabilities | null> {
  const res = await axios.get(endpoints.chatbot.capabilities, KEEP_STATUS);
  if (res.status === 404) return null;
  const data = unwrap<AssistantCapabilities>(res);
  return data && typeof data.enabled === 'boolean' ? data : null;
}

/** Xin URL PUT ảnh lên R2 (1–4 ảnh). Lỗi: 403 không bật ảnh, 413 quá lớn, 415 sai loại → HttpStatusError. */
export async function presignAssistantImages(sessionId: string, files: PresignImageFile[]): Promise<PresignedTarget[]> {
  const res = await axios.post(endpoints.chatbot.presign(sessionId), { files }, KEEP_STATUS);
  const data = unwrap<PresignedTarget[] | { files?: PresignedTarget[] }>(res);
  const targets = Array.isArray(data) ? data : data?.files;
  if (!Array.isArray(targets) || targets.length !== files.length || targets.some((t) => !t?.objectKey || !t?.uploadUrl)) {
    throw new HttpStatusError(502, data);
  }
  return targets;
}

export async function fetchSessionMessages(sessionId: string, limit = 50): Promise<AssistantMessage[]> {
  const res = await axios.get(endpoints.chatbot.sessionMessages(sessionId), { params: { limit } });
  return res.data;
}

/** Gửi câu hỏi (+ objectKey ảnh đã PUT lên R2). content được rỗng khi có ảnh. Lỗi → HttpStatusError. */
export async function sendAssistantMessage(
  sessionId: string,
  content: string,
  attachments?: { objectKey: string }[]
): Promise<SendAssistantMessageResult> {
  const body = attachments?.length ? { sessionId, content, attachments } : { sessionId, content };
  const res = await axios.post(endpoints.chatbot.messages, body, KEEP_STATUS);
  return unwrap<SendAssistantMessageResult>(res);
}

/** Thử lại câu trả lời lỗi (cùng id tin). 404 (server cũ / không thấy) hoặc 409 (không thử lại được) → HttpStatusError. */
export async function retryAssistantMessage(messageId: string): Promise<{ assistantMessageId: string }> {
  const res = await axios.post(endpoints.chatbot.retry(messageId), {}, KEEP_STATUS);
  return unwrap<{ assistantMessageId: string }>(res);
}
