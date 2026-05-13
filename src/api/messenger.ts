import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------

export type ConversationType = 'Private' | 'Group';

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

export type DirectMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  editedAt?: string | null;
  isDeleted?: boolean;
  readBy?: { userId: string; readAt: string }[];
};

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

export async function markRead(conversationId: string): Promise<void> {
  await axios.post(endpoints.messenger.markRead(conversationId));
}

export async function fetchUsers(): Promise<InternalUser[]> {
  const res = await axios.get(endpoints.messenger.users);
  return res.data;
}
