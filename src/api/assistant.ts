import axios, { endpoints } from './axios';

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

export type SendAssistantMessageResult = {
  messageId: string;
  assistantMessageId: string;
  fromCache: boolean;
  cachedAnswer?: string | null;
};

export async function startOrResumeSession(sessionId?: string, displayName?: string): Promise<AssistantSession> {
  const res = await axios.post(endpoints.chatbot.sessions, { sessionId, displayName });
  return res.data;
}

export async function fetchSessionMessages(sessionId: string, limit = 50): Promise<AssistantMessage[]> {
  const res = await axios.get(endpoints.chatbot.sessionMessages(sessionId), { params: { limit } });
  return res.data;
}

export async function sendAssistantMessage(sessionId: string, content: string): Promise<SendAssistantMessageResult> {
  const res = await axios.post(endpoints.chatbot.messages, { sessionId, content });
  return res.data;
}
