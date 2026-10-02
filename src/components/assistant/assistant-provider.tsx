import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import * as signalR from '@microsoft/signalr';

import { getHostApi } from 'src/api/axios';
import { currentAccessToken } from 'src/api/session';
import type { AssistantStep } from 'src/api/assistant';
import { useAuthContext } from 'src/auth/auth-context';
import { isMultiStore } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Kết nối SignalR dùng chung cho tab "Trợ lý" (AI Chat) — KHÁC HOÀN TOÀN
// với tin nhắn nội bộ (src/components/messenger/*). Khớp đúng tên
// event/hub method mà BE phát (xem ChatHub / ChatHubNotifier):
//   events: streamingStarted | step | chunk | status | completed | error
//   invoke: JoinSession (→ bool, server cũ trả void) | LeaveSession
// Không dùng store toàn cục như messenger — mỗi nhân viên chỉ có 1 phiên
// chat trợ lý tại 1 thời điểm, nên màn Trợ lý (use-assistant-chat) tự giữ
// state tin nhắn và chỉ subscribe trực tiếp vào provider này.
//
// Join chắc chắn: nhớ các phiên cần nghe (wanted) — join ngay khi kết nối xong, join lại sau mỗi lần
// kết nối lại, rồi phát {type:'reconnected'} để màn tải lại tin từ REST (sự kiện lúc rớt mạng đã mất).
// ----------------------------------------------------------------------

// Hàm, không phải hằng: bản app cửa hàng chỉ biết gốc API sau khi đọc mã cửa hàng. Bản cửa hàng bỏ qua biến
// môi trường ghi đè hub (cùng lý do với messenger-provider: URL cố định là hub của CiCi).
export const hubUrl = () => (!isMultiStore && process.env.EXPO_PUBLIC_ASSISTANT_HUB_URL) || `${getHostApi()}/hubs/chat`;

/** Chờ kết nối tối đa chừng này khi join; quá thì vẫn giữ trong wanted để join khi kết nối được. */
const JOIN_WAIT_MS = 8000;
/** Kết nối lần đầu thất bại (mất mạng) → thử lại theo nhịp này; withAutomaticReconnect chỉ lo SAU khi đã nối được. */
const START_RETRY_MS = [2000, 5000, 10000, 30000];

export type AssistantHubEvent =
  | { type: 'streamingStarted'; sessionId: string; messageId: string; v?: number }
  | { type: 'step'; sessionId: string; messageId: string; step: AssistantStep }
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
  | {
      type: 'completed';
      sessionId: string;
      messageId: string;
      content: string;
      fromCache?: boolean;
      v?: number;
      status?: string;
      blocks?: unknown[] | null;
      steps?: AssistantStep[] | null;
    }
  | {
      type: 'error';
      sessionId: string;
      messageId: string;
      error: string;
      v?: number;
      code?: string;
      retryable?: boolean;
      partial?: string | null;
    }
  // Không thuộc phiên nào: vừa kết nối (lại) xong và đã join lại — màn nên tải lại tin từ REST.
  | { type: 'reconnected' };

type AssistantContextValue = {
  /** true = đã join (hoặc sẽ join khi kết nối được); false = server từ chối (phiên không tồn tại / không phải của mình). */
  joinSession: (sessionId: string) => Promise<boolean>;
  leaveSession: (sessionId: string) => void;
  subscribe: (handler: (ev: AssistantHubEvent) => void) => () => void;
};

const AssistantCtx = createContext<AssistantContextValue>({
  joinSession: async () => true,
  leaveSession: () => {},
  subscribe: () => () => {},
});

export function useAssistantCtx() {
  return useContext(AssistantCtx);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthContext();
  const userId = user?.id;
  const connRef = useRef<signalR.HubConnection | null>(null);
  // Các phiên màn hình đang cần nghe — sống qua mọi lần kết nối lại.
  const wantedRef = useRef<Set<string>>(new Set());
  // Resolve khi kết nối (lần đầu / sau khi đóng hẳn) xong; null = chưa bắt đầu.
  const startPromiseRef = useRef<Promise<void> | null>(null);
  const listenersRef = useRef<Set<(ev: AssistantHubEvent) => void>>(new Set());

  const emit = useCallback((ev: AssistantHubEvent) => {
    listenersRef.current.forEach((fn) => fn(ev));
  }, []);

  useEffect(() => {
    if (!userId) return undefined;
    let mounted = true;
    const wanted = wantedRef.current;

    /** JoinSession mọi phiên đang cần nghe; server trả false (không phải phiên của mình) → bỏ khỏi danh sách. */
    async function joinAll(conn: signalR.HubConnection) {
      for (const id of Array.from(wanted)) {
        try {
          const ok = await conn.invoke<boolean | undefined>('JoinSession', id);
          if (ok === false) wanted.delete(id);
        } catch {
          /* rớt kết nối giữa chừng — onreconnected sẽ join lại */
        }
      }
    }

    // Chỉ một vòng start chạy cùng lúc (onclose có thể bắn khi start lỗi).
    let looping: Promise<void> | null = null;

    /** start() đến khi được (hoặc màn bị huỷ). Xong thì join lại các phiên và báo 'reconnected'. */
    function startLoop(conn: signalR.HubConnection): Promise<void> {
      if (looping) return looping;
      const run = async () => {
        for (let attempt = 0; mounted; attempt++) {
          try {
            await conn.start();
            break;
          } catch {
            /* offline — thử lại sau */
          }
          await delay(START_RETRY_MS[Math.min(attempt, START_RETRY_MS.length - 1)]!);
        }
        if (!mounted || conn.state !== signalR.HubConnectionState.Connected) return;
        await joinAll(conn);
        emit({ type: 'reconnected' });
      };
      looping = run().finally(() => {
        looping = null;
      });
      return looping;
    }

    (async () => {
      const token = await currentAccessToken();
      if (!token || !mounted) return;

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl(), {
          // Đọc token hiện tại mỗi lần (kết nối lại): token có thể đã được làm mới sau 401.
          accessTokenFactory: currentAccessToken,
          transport: signalR.HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      // Payload server gửi thêm trường mới (v, blocks, steps, code…) — trải nguyên vào sự kiện.
      conn.on('streamingStarted', (ev: { sessionId: string; messageId: string; v?: number }) =>
        emit({ ...ev, type: 'streamingStarted' })
      );
      conn.on('step', (ev: { sessionId: string; messageId: string; step: AssistantStep }) => {
        if (ev?.step?.id) emit({ ...ev, type: 'step' });
      });
      conn.on('chunk', (ev: { sessionId: string; messageId: string; content: string }) =>
        emit({ ...ev, type: 'chunk' })
      );
      conn.on(
        'status',
        (ev: { sessionId: string; messageId: string; kind?: string; phase?: string; name?: string; label?: string; detail?: string }) =>
          emit({ ...ev, type: 'status' })
      );
      conn.on(
        'completed',
        (ev: { sessionId: string; messageId: string; content: string; fromCache?: boolean; blocks?: unknown[] | null; steps?: AssistantStep[] | null }) =>
          emit({ ...ev, type: 'completed' })
      );
      conn.on('error', (ev: { sessionId: string; messageId: string; error: string; code?: string; partial?: string | null }) =>
        emit({ ...ev, type: 'error' })
      );

      conn.onreconnected(async () => {
        await joinAll(conn);
        emit({ type: 'reconnected' });
      });
      // Tự kết nối lại cũng bỏ cuộc (hết lượt thử) → bắt đầu lại vòng start, không để chết hẳn.
      conn.onclose(() => {
        if (mounted) startPromiseRef.current = startLoop(conn);
      });

      connRef.current = conn;
      startPromiseRef.current = startLoop(conn);
    })();

    return () => {
      mounted = false;
      const conn = connRef.current;
      connRef.current = null;
      startPromiseRef.current = null;
      wanted.clear();
      conn?.stop().catch(() => {});
    };
  }, [userId, emit]);

  const joinSession = useCallback(async (sessionId: string): Promise<boolean> => {
    wantedRef.current.add(sessionId);
    const ready = startPromiseRef.current;
    // Chưa tạo kết nối (đang lấy token) → vòng start sẽ join khi xong.
    if (!ready) return true;
    let conn = connRef.current;
    if (conn?.state !== signalR.HubConnectionState.Connected) {
      await Promise.race([ready, delay(JOIN_WAIT_MS)]);
      conn = connRef.current;
    }
    // Vẫn chưa kết nối được — giữ trong wanted, join khi kết nối/kết nối lại (màn có watchdog tải lại từ REST).
    if (!conn || conn.state !== signalR.HubConnectionState.Connected) return true;
    try {
      const ok = await conn.invoke<boolean | undefined>('JoinSession', sessionId);
      // Server cũ: JoinSession trả void (undefined) → coi như được.
      if (ok === false) {
        wantedRef.current.delete(sessionId);
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }, []);

  const leaveSession = useCallback((sessionId: string) => {
    wantedRef.current.delete(sessionId);
    const conn = connRef.current;
    if (conn?.state === signalR.HubConnectionState.Connected) {
      conn.invoke('LeaveSession', sessionId).catch(() => {});
    }
  }, []);

  const subscribe = useCallback((handler: (ev: AssistantHubEvent) => void) => {
    listenersRef.current.add(handler);
    return () => {
      listenersRef.current.delete(handler);
    };
  }, []);

  const value = useMemo(() => ({ joinSession, leaveSession, subscribe }), [joinSession, leaveSession, subscribe]);

  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}
