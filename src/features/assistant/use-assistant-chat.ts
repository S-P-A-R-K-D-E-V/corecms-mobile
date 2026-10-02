import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { haptics } from 'src/services/haptics';
import { startOrResumeSession, fetchSessionMessages, sendAssistantMessage } from 'src/api/assistant';
import { useAssistantCtx, type AssistantHubEvent } from 'src/components/assistant/assistant-provider';
import {
  LOCAL_ID_PREFIX,
  confirmOptimistic,
  expireStalePending,
  isInFlight,
  mergeServerMessages,
  reduceAssistantEvent,
  type ScreenMessage,
} from './assistant-events';

// ----------------------------------------------------------------------
// State của màn Trợ lý: phiên, danh sách tin, gửi. Câu trả lời đến qua SignalR (assistant-provider); để
// không bao giờ "quay mãi" khi lỡ sự kiện (join trước khi kết nối xong, rớt mạng, app ở nền, nhiều bản core-api):
//   - im lặng ≥ 20s khi đang chờ → cứ 5s tải lại 20 tin cuối từ REST rồi gộp (server đã lưu bản cuối);
//   - quá 6 phút vẫn chưa xong → đánh lỗi (có Thử lại);
//   - app quay lại foreground / hub kết nối lại → tải lại một lần.
// ----------------------------------------------------------------------

const SESSION_STORAGE_KEY = 'assistantSessionId';
const HISTORY_LIMIT = 50;
const REFETCH_LIMIT = 20;
const SILENCE_MS = 20_000;
const POLL_MS = 5_000;
const MAX_PENDING_MS = 6 * 60_000;

export function useAssistantChat({ enabled }: { enabled: boolean }) {
  const { joinSession, leaveSession, subscribe } = useAssistantCtx();

  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Đang chờ mà im lặng quá lâu — màn hiện "vẫn đang xử lý…".
  const [stale, setStale] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const lastEventAtRef = useRef(0);

  const touch = useCallback(() => {
    lastEventAtRef.current = Date.now();
    setStale(false);
  }, []);

  /** Tải lại tin cuối từ REST rồi gộp vào state (không xoá tin đang có). */
  const refetch = useCallback(async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    try {
      const server = await fetchSessionMessages(id, REFETCH_LIMIT);
      if (sessionIdRef.current !== id || !Array.isArray(server)) return;
      setMessages((prev) => expireStalePending(mergeServerMessages(prev, server), Date.now(), MAX_PENDING_MS));
    } catch {
      /* mất mạng — lượt sau thử lại */
    }
  }, []);

  const open = useCallback(
    async (fresh: boolean) => {
      setLoading(true);
      try {
        if (fresh) await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
        const storedSessionId = fresh ? undefined : (await SecureStore.getItemAsync(SESSION_STORAGE_KEY)) || undefined;
        const session = await startOrResumeSession(storedSessionId);
        const previous = sessionIdRef.current;
        if (previous && previous !== session.sessionId) leaveSession(previous);
        sessionIdRef.current = session.sessionId;
        setSessionId(session.sessionId);
        setMessages([]);
        touch();
        await SecureStore.setItemAsync(SESSION_STORAGE_KEY, session.sessionId);
        // Không chờ join xong mới tải lịch sử: join tự đợi kết nối (tối đa 8s) và join lại khi kết nối lại.
        void joinSession(session.sessionId);
        if (!fresh) {
          const history = await fetchSessionMessages(session.sessionId, HISTORY_LIMIT);
          if (sessionIdRef.current === session.sessionId && Array.isArray(history)) {
            setMessages((prev) => expireStalePending(mergeServerMessages(prev, history), Date.now(), MAX_PENDING_MS));
          }
        }
      } catch {
        /* để trống, người dùng vẫn gõ được — sẽ tạo phiên mới khi gửi thất bại lần đầu */
      } finally {
        setLoading(false);
      }
    },
    [joinSession, leaveSession, touch]
  );

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    void open(false);
    return () => {
      if (sessionIdRef.current) leaveSession(sessionIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    return subscribe((ev: AssistantHubEvent) => {
      if (ev.type === 'reconnected') {
        void refetch();
        return;
      }
      if (!sessionIdRef.current || ev.sessionId !== sessionIdRef.current) return;
      touch();
      setMessages((prev) => reduceAssistantEvent(prev, ev));
    });
  }, [subscribe, refetch, touch]);

  // Quay lại app: sự kiện lúc ở nền có thể đã mất.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refetch();
    });
    return () => sub.remove();
  }, [refetch]);

  // Watchdog: chỉ chạy khi có tin đang chờ.
  const hasInFlight = messages.some(isInFlight);
  useEffect(() => {
    if (!hasInFlight || !sessionId) {
      setStale(false);
      return undefined;
    }
    const timer = setInterval(() => {
      const now = Date.now();
      setMessages((prev) => expireStalePending(prev, now, MAX_PENDING_MS));
      if (now - lastEventAtRef.current >= SILENCE_MS) {
        setStale(true);
        void refetch();
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [hasInFlight, sessionId, refetch]);

  /** Gửi câu hỏi. Trả false nếu gửi không được (màn trả lại chữ vào ô nhập). */
  const send = useCallback(
    async (raw: string): Promise<boolean> => {
      const content = raw.trim();
      const current = sessionIdRef.current;
      if (!content || sending || !current) return false;
      haptics.light();
      setSending(true);
      const localId = `${LOCAL_ID_PREFIX}${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: localId, role: 'user', content, createdAt: new Date().toISOString(), status: 'complete' },
      ]);
      try {
        const result = await sendAssistantMessage(current, content);
        touch();
        setMessages((prev) => {
          const confirmed = result.messageId ? confirmOptimistic(prev, localId, result.messageId) : prev;
          if (result.fromCache && result.cachedAnswer) {
            return reduceAssistantEvent(confirmed, {
              type: 'completed',
              sessionId: current,
              messageId: result.assistantMessageId,
              content: result.cachedAnswer,
              fromCache: true,
            });
          }
          // Chỗ chờ — nội dung thật đến qua SignalR (streamingStarted/step/chunk/completed) hoặc watchdog.
          if (confirmed.some((m) => m.id === result.assistantMessageId)) return confirmed;
          const now = Date.now();
          return [
            ...confirmed,
            {
              id: result.assistantMessageId,
              role: 'assistant',
              content: '',
              createdAt: new Date(now).toISOString(),
              status: 'pending',
              streaming: true,
              pendingSince: now,
            },
          ];
        });
        return true;
      } catch {
        setMessages((prev) => prev.filter((m) => m.id !== localId));
        return false;
      } finally {
        setSending(false);
      }
    },
    [sending, touch]
  );

  return { messages, loading, sending, sessionId, stale, open, send, refetch };
}
