import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';

import { HOST_API } from 'src/api/axios';
import { useAuthContext } from 'src/auth/auth-context';

// ----------------------------------------------------------------------
// Kết nối SignalR dùng chung cho tab "Trợ lý" (AI Chat) — KHÁC HOÀN TOÀN
// với tin nhắn nội bộ (src/components/messenger/*). Khớp đúng tên
// event/hub method mà BE phát (xem ChatHub / ChatHubNotifier):
//   events: streamingStarted | chunk | status | completed | error
//   invoke: JoinSession | LeaveSession
// Không dùng store toàn cục như messenger — mỗi nhân viên chỉ có 1 phiên
// chat trợ lý tại 1 thời điểm, nên AssistantScreen tự giữ state tin nhắn
// (React Query cho lịch sử + state local cho nội dung đang stream) và chỉ
// subscribe trực tiếp vào provider này để nhận event theo thời gian thực.
// ----------------------------------------------------------------------

const HUB_URL = process.env.EXPO_PUBLIC_ASSISTANT_HUB_URL ?? `${HOST_API}/hubs/chat`;

export type AssistantHubEvent =
  | { type: 'streamingStarted'; sessionId: string; messageId: string }
  | { type: 'chunk'; sessionId: string; messageId: string; content: string }
  | {
      type: 'status';
      sessionId: string;
      messageId: string;
      kind?: string;
      phase?: string;
      name?: string;
      label?: string;
      detail?: string;
    }
  | { type: 'completed'; sessionId: string; messageId: string; content: string; fromCache?: boolean }
  | { type: 'error'; sessionId: string; messageId: string; error: string };

type AssistantContextValue = {
  joinSession: (sessionId: string) => Promise<void>;
  leaveSession: (sessionId: string) => void;
  subscribe: (handler: (ev: AssistantHubEvent) => void) => () => void;
};

const AssistantCtx = createContext<AssistantContextValue>({
  joinSession: async () => {},
  leaveSession: () => {},
  subscribe: () => () => {},
});

export function useAssistantCtx() {
  return useContext(AssistantCtx);
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const connRef = useRef<signalR.HubConnection | null>(null);
  const joinedRef = useRef<Set<string>>(new Set());
  const listenersRef = useRef<Set<(ev: AssistantHubEvent) => void>>(new Set());

  const emit = useCallback((ev: AssistantHubEvent) => {
    listenersRef.current.forEach((fn) => fn(ev));
  }, []);

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

      conn.on('streamingStarted', (ev: { sessionId: string; messageId: string }) =>
        emit({ type: 'streamingStarted', ...ev })
      );
      conn.on('chunk', (ev: { sessionId: string; messageId: string; content: string }) =>
        emit({ type: 'chunk', ...ev })
      );
      conn.on(
        'status',
        (ev: { sessionId: string; messageId: string; kind?: string; phase?: string; name?: string; label?: string; detail?: string }) =>
          emit({ type: 'status', ...ev })
      );
      conn.on('completed', (ev: { sessionId: string; messageId: string; content: string; fromCache?: boolean }) =>
        emit({ type: 'completed', ...ev })
      );
      conn.on('error', (ev: { sessionId: string; messageId: string; error: string }) => emit({ type: 'error', ...ev }));

      conn.onreconnected(async () => {
        for (const id of Array.from(joinedRef.current)) {
          try {
            await conn.invoke('JoinSession', id);
          } catch {
            /* ignore */
          }
        }
      });

      try {
        await conn.start();
        if (mounted) connRef.current = conn;
        else await conn.stop();
      } catch {
        /* offline — auto-reconnect sẽ thử lại */
      }
    })();

    return () => {
      mounted = false;
      connRef.current?.stop();
      connRef.current = null;
      joinedRef.current.clear();
    };
  }, [user, emit]);

  const joinSession = useCallback(async (sessionId: string) => {
    const conn = connRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected && !joinedRef.current.has(sessionId)) {
      try {
        await conn.invoke('JoinSession', sessionId);
        joinedRef.current.add(sessionId);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const leaveSession = useCallback((sessionId: string) => {
    const conn = connRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected && joinedRef.current.has(sessionId)) {
      conn.invoke('LeaveSession', sessionId).catch(() => {});
      joinedRef.current.delete(sessionId);
    }
  }, []);

  const subscribe = useCallback((handler: (ev: AssistantHubEvent) => void) => {
    listenersRef.current.add(handler);
    return () => listenersRef.current.delete(handler);
  }, []);

  const value = useMemo(() => ({ joinSession, leaveSession, subscribe }), [joinSession, leaveSession, subscribe]);

  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}
