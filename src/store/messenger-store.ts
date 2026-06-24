import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import type { ConversationSummary, DirectMessage, InternalUser } from 'src/api/messenger';

// ----------------------------------------------------------------------
// Ported directly from core-fe/src/store/messenger-store.ts
// No changes needed — Zustand + Immer is React Native compatible
// ----------------------------------------------------------------------

type State = {
  conversations: ConversationSummary[];
  messagesByConv: Record<string, DirectMessage[]>;
  typingByConv: Record<string, string[]>;
  userCache: Record<string, InternalUser>;
  onlineIds: string[];
  /** Hội thoại đang mở — dùng để bỏ qua thông báo tin nhắn của chính cuộc đang xem. */
  activeConversationId: string | null;
  /** Đang ở màn danh sách "Tin nhắn" — khi đó hiện thông báo trong app thay vì push OS. */
  onMessagesScreen: boolean;
  /** Hàng đợi thông báo tin nhắn hiển thị ngay trong app (toast). */
  inAppNotifs: InAppNotif[];
};

export type InAppNotif = { id: string; convId: string; title: string; preview: string; name: string; at: number };

type Actions = {
  setConversations: (list: ConversationSummary[]) => void;
  touchConversation: (ev: {
    conversationId: string;
    lastMessagePreview: string | null;
    lastMessageSenderId: string | null;
    lastMessageAt: string | null;
    incrementsUnreadForSelf: boolean;
  }) => void;
  updateConversation: (patch: Partial<ConversationSummary> & { id: string }) => void;
  setMessages: (convId: string, msgs: DirectMessage[]) => void;
  prependMessages: (convId: string, msgs: DirectMessage[]) => void;
  addMessage: (msg: DirectMessage) => void;
  applyReadReceipt: (convId: string, userId: string, readAt: string) => void;
  clearUnread: (convId: string) => void;
  setTyping: (convId: string, userId: string, active: boolean) => void;
  setUserCache: (users: InternalUser[]) => void;
  setOnline: (userId: string, online: boolean) => void;
  setActiveConversation: (convId: string | null) => void;
  setOnMessagesScreen: (on: boolean) => void;
  pushInAppNotif: (n: InAppNotif) => void;
  dismissInAppNotif: (id: string) => void;
};

export const useMessengerStore = create<State & Actions>()(
  immer((set) => ({
    conversations: [],
    messagesByConv: {},
    typingByConv: {},
    userCache: {},
    onlineIds: [],
    activeConversationId: null,
    onMessagesScreen: false,
    inAppNotifs: [],

    setConversations: (list) => set((s) => { s.conversations = list; }),

    setActiveConversation: (convId) => set((s) => { s.activeConversationId = convId; }),

    setOnMessagesScreen: (on) => set((s) => { s.onMessagesScreen = on; }),

    pushInAppNotif: (n) =>
      set((s) => {
        // Gộp theo hội thoại: bỏ thông báo cũ cùng convId rồi đẩy mới lên
        s.inAppNotifs = [n, ...s.inAppNotifs.filter((x) => x.convId !== n.convId)].slice(0, 3);
      }),

    dismissInAppNotif: (id) =>
      set((s) => { s.inAppNotifs = s.inAppNotifs.filter((x) => x.id !== id); }),

    touchConversation: (ev) =>
      set((s) => {
        const idx = s.conversations.findIndex((c) => c.id === ev.conversationId);
        if (idx >= 0) {
          s.conversations[idx].lastMessagePreview = ev.lastMessagePreview;
          s.conversations[idx].lastMessageSenderId = ev.lastMessageSenderId;
          s.conversations[idx].lastMessageAt = ev.lastMessageAt;
          if (ev.incrementsUnreadForSelf) s.conversations[idx].unreadCount += 1;
          const conv = { ...s.conversations[idx] };
          s.conversations.splice(idx, 1);
          s.conversations.unshift(conv as any);
        }
      }),

    updateConversation: (patch) =>
      set((s) => {
        const idx = s.conversations.findIndex((c) => c.id === patch.id);
        if (idx >= 0) Object.assign(s.conversations[idx], patch);
      }),

    setMessages: (convId, msgs) => set((s) => { s.messagesByConv[convId] = msgs; }),

    prependMessages: (convId, msgs) =>
      set((s) => {
        const existing = s.messagesByConv[convId] ?? [];
        s.messagesByConv[convId] = [...msgs, ...existing];
      }),

    addMessage: (msg) =>
      set((s) => {
        const list = s.messagesByConv[msg.conversationId] ?? [];
        if (!list.find((m) => m.id === msg.id)) {
          s.messagesByConv[msg.conversationId] = [...list, msg];
        }
      }),

    applyReadReceipt: (convId, userId, readAt) =>
      set((s) => {
        const msgs = s.messagesByConv[convId];
        if (!msgs) return;
        for (const m of msgs) {
          if (!m.readBy) m.readBy = [];
          if (!m.readBy.find((r) => r.userId === userId)) {
            m.readBy.push({ userId, readAt });
          }
        }
      }),

    clearUnread: (convId) =>
      set((s) => {
        const conv = s.conversations.find((c) => c.id === convId);
        if (conv) conv.unreadCount = 0;
      }),

    setTyping: (convId, userId, active) =>
      set((s) => {
        const current = s.typingByConv[convId] ?? [];
        if (active) {
          if (!current.includes(userId)) s.typingByConv[convId] = [...current, userId];
        } else {
          s.typingByConv[convId] = current.filter((id) => id !== userId);
        }
      }),

    setUserCache: (users) =>
      set((s) => { for (const u of users) s.userCache[u.id] = u; }),

    setOnline: (userId, online) =>
      set((s) => {
        if (online) {
          if (!s.onlineIds.includes(userId)) s.onlineIds.push(userId);
          if (s.userCache[userId]) s.userCache[userId].online = true;
        } else {
          s.onlineIds = s.onlineIds.filter((id) => id !== userId);
          if (s.userCache[userId]) s.userCache[userId].online = false;
        }
      }),
  }))
);

// Mảng rỗng dùng chung (ref ổn định) — TRÁNH tạo `[]` mới trong selector,
// nếu không useSyncExternalStore thấy snapshot đổi mỗi render → vòng lặp vô hạn
// → crash khi mở hội thoại CHƯA có tin nhắn (đúng lúc bấm vào user để mở chat mới).
const EMPTY_MESSAGES: DirectMessage[] = [];
const EMPTY_TYPING: string[] = [];

export const selectMessages = (convId: string) => (s: State & Actions) =>
  s.messagesByConv[convId] ?? EMPTY_MESSAGES;
export const selectTyping = (convId: string) => (s: State & Actions) =>
  s.typingByConv[convId] ?? EMPTY_TYPING;
export const selectUser = (userId: string) => (s: State & Actions) => s.userCache[userId];
