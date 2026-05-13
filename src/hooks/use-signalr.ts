import { useEffect, useRef, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';

import { useMessengerStore } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';

const HUB_URL = process.env.EXPO_PUBLIC_SIGNALR_HUB_URL ?? 'http://localhost:2510/hubs/messenger';

// ----------------------------------------------------------------------

export function useSignalR() {
  const { user } = useAuthContext();
  const connectionRef = useRef<signalR.HubConnection | null>(null);

  const {
    touchConversation,
    addMessage,
    applyReadReceipt,
    setTyping,
    setOnline,
  } = useMessengerStore();

  const buildConnection = useCallback(async () => {
    const token = await SecureStore.getItemAsync('accessToken');

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token ?? '',
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    // Incoming message
    connection.on('ReceiveMessage', (message) => {
      addMessage(message);
      touchConversation({
        conversationId: message.conversationId,
        lastMessagePreview: message.content,
        lastMessageSenderId: message.senderId,
        lastMessageAt: message.createdAt,
        incrementsUnreadForSelf: message.senderId !== user?.id,
      });
    });

    // Read receipt
    connection.on('MessageRead', (convId: string, userId: string, readAt: string) => {
      applyReadReceipt(convId, userId, readAt);
    });

    // Typing indicator
    connection.on('UserTyping', (convId: string, userId: string) => {
      setTyping(convId, userId, true);
      setTimeout(() => setTyping(convId, userId, false), 3000);
    });

    // Presence
    connection.on('UserOnline', (userId: string) => setOnline(userId, true));
    connection.on('UserOffline', (userId: string) => setOnline(userId, false));

    return connection;
  }, [user?.id, addMessage, touchConversation, applyReadReceipt, setTyping, setOnline]);

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    (async () => {
      const conn = await buildConnection();
      if (!mounted) return;
      connectionRef.current = conn;
      try {
        await conn.start();
      } catch {}
    })();

    return () => {
      mounted = false;
      connectionRef.current?.stop();
      connectionRef.current = null;
    };
  }, [user, buildConnection]);

  const sendTyping = useCallback((conversationId: string) => {
    connectionRef.current?.invoke('SendTyping', conversationId).catch(() => {});
  }, []);

  return { connection: connectionRef.current, sendTyping };
}
