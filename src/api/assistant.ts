import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// AI Chat trợ lý (khác hoàn toàn với tab "Chat" nhắn tin nội bộ ở
// src/api/messenger.ts). Endpoint dùng chung cho mọi role — BE tự phân
// luồng Admin/Staff/CustomerSupport theo JWT của người gọi
// (ChatContextService.ResolveCustomerAsync), client không cần biết/chọn
// agent. Câu trả lời stream qua SignalR hub /hubs/chat, không phải REST
// polling — xem src/components/assistant/assistant-provider.tsx.
// ----------------------------------------------------------------------

export type AssistantMessageRole = 'user' | 'assistant' | 'system';

export type AssistantSession = {
  sessionId: string;
  ownerType: string;
  agent: string;
  displayName?: string | null;
  expiresAt: string;
  createdAt: string;
};

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
  fromCache?: boolean;
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
