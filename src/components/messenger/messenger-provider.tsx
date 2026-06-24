import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';

import { HOST_API } from 'src/api/axios';
import { useAuthContext } from 'src/auth/auth-context';
import { fetchConversations, fetchUsers } from 'src/api/messenger';
import { useMessengerStore } from 'src/store/messenger-store';

// ----------------------------------------------------------------------
// Một kết nối SignalR dùng chung cho toàn app (mount ở tab layout khi đã đăng nhập).
// Khớp đúng tên event/hub method mà BE phát (xem MessengerHub / MessengerHubNotifier):
//   events:  message | conversationTouched | conversationUpdated | userTyping | readReceipt | userOnline | userOffline
//   invoke:  JoinConversation | LeaveConversation | TypingAsync | ReadReceiptAsync
// ----------------------------------------------------------------------

const HUB_URL = process.env.EXPO_PUBLIC_SIGNALR_HUB_URL ?? `${HOST_API}/hubs/messenger`;

type MessengerContextValue = {
  connection: signalR.HubConnection | null;
  joinConversation: (conversationId: string) => Promise<void>;
  leaveConversation: (conversationId: string) => void;
  sendTyping: (conversationId: string) => void;
  sendReadReceipt: (conversationId: string) => void;
};

const MessengerCtx = createContext<MessengerContextValue>({
  connection: null,
  joinConversation: async () => {},
  leaveConversation: () => {},
  sendTyping: () => {},
  sendReadReceipt: () => {},
});

export function useMessengerCtx() {
  return useContext(MessengerCtx);
}

export function MessengerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const connRef = useRef<signalR.HubConnection | null>(null);
  const joinedRef = useRef<Set<string>>(new Set());
  const typingSentRef = useRef<Record<string, number>>({});
  const userIdRef = useRef<string | undefined>(user?.id);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  // Bootstrap: nạp danh bạ + danh sách hội thoại vào store
  useEffect(() => {
    if (!user) return;
    const s = useMessengerStore.getState();
    fetchUsers().then(s.setUserCache).catch(() => {});
    fetchConversations().then(s.setConversations).catch(() => {});
  }, [user]);

  // Kết nối SignalR
  useEffect(() => {
    if (!user) return undefined;
    let mounted = true;

    (async () => {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token || !mounted) return;

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(HUB_URL, {
          accessTokenFactory: () => token,
          transport: signalR.HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      const store = () => useMessengerStore.getState();

      conn.on('message', (ev: any) => {
        const s = store();
        s.addMessage(ev);
        s.setTyping(ev.conversationId, ev.senderId, false);

        // Khi đang ở màn danh sách "Tin nhắn" (không phải đang mở đúng hội thoại đó),
        // hiện thông báo NGAY TRONG APP thay vì để push OS bật lên.
        const fromOther = ev.senderId !== userIdRef.current;
        if (fromOther && s.onMessagesScreen && s.activeConversationId !== ev.conversationId) {
          const sender = s.userCache[ev.senderId];
          const preview =
            (ev.content && String(ev.content).trim()) ||
            (ev.attachments?.length
              ? ev.attachments[0].kind === 'image' ? '📷 Hình ảnh' : '📎 Tệp đính kèm'
              : '');
          const name = sender?.fullName ?? 'Tin nhắn mới';
          s.pushInAppNotif({ id: ev.id, convId: ev.conversationId, title: name, name, preview, at: Date.now() });
        }
      });

      conn.on('conversationTouched', (ev: any) => {
        store().touchConversation({
          conversationId: ev.conversationId,
          lastMessagePreview: ev.lastMessagePreview,
          lastMessageSenderId: ev.lastMessageSenderId,
          lastMessageAt: ev.lastMessageAt,
          incrementsUnreadForSelf: ev.incrementsUnreadForSelf && ev.lastMessageSenderId !== userIdRef.current,
        });
      });

      conn.on('conversationUpdated', () => {
        fetchConversations().then(store().setConversations).catch(() => {});
      });

      conn.on('userTyping', (ev: { conversationId: string; userId: string }) => {
        store().setTyping(ev.conversationId, ev.userId, true);
        setTimeout(() => useMessengerStore.getState().setTyping(ev.conversationId, ev.userId, false), 3000);
      });

      conn.on('readReceipt', (ev: { conversationId: string; userId: string; readAt: string }) => {
        store().applyReadReceipt(ev.conversationId, ev.userId, ev.readAt);
      });

      conn.on('userOnline', (uid: string) => store().setOnline(uid, true));
      conn.on('userOffline', (uid: string) => store().setOnline(uid, false));

      conn.onreconnected(async () => {
        for (const id of Array.from(joinedRef.current)) {
          try { await conn.invoke('JoinConversation', id); } catch { /* ignore */ }
        }
        fetchConversations().then(useMessengerStore.getState().setConversations).catch(() => {});
      });

      try {
        await conn.start();
        if (mounted) connRef.current = conn;
        else await conn.stop();
      } catch { /* offline — auto-reconnect sẽ thử lại */ }
    })();

    return () => {
      mounted = false;
      connRef.current?.stop();
      connRef.current = null;
      joinedRef.current.clear();
    };
  }, [user]);

  const joinConversation = useCallback(async (conversationId: string) => {
    const conn = connRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected && !joinedRef.current.has(conversationId)) {
      try {
        await conn.invoke('JoinConversation', conversationId);
        joinedRef.current.add(conversationId);
      } catch { /* ignore */ }
    }
  }, []);

  const leaveConversation = useCallback((conversationId: string) => {
    const conn = connRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected && joinedRef.current.has(conversationId)) {
      conn.invoke('LeaveConversation', conversationId).catch(() => {});
      joinedRef.current.delete(conversationId);
    }
  }, []);

  const sendTyping = useCallback((conversationId: string) => {
    const conn = connRef.current;
    if (conn?.state !== signalR.HubConnectionState.Connected) return;
    const now = Date.now();
    if (!typingSentRef.current[conversationId] || now - typingSentRef.current[conversationId] > 2000) {
      typingSentRef.current[conversationId] = now;
      conn.invoke('TypingAsync', conversationId).catch(() => {});
    }
  }, []);

  const sendReadReceipt = useCallback((conversationId: string) => {
    const conn = connRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      conn.invoke('ReadReceiptAsync', conversationId).catch(() => {});
    }
  }, []);

  const value = useMemo(
    () => ({ connection: connRef.current, joinConversation, leaveConversation, sendTyping, sendReadReceipt }),
    [joinConversation, leaveConversation, sendTyping, sendReadReceipt]
  );

  return <MessengerCtx.Provider value={value}>{children}</MessengerCtx.Provider>;
}
