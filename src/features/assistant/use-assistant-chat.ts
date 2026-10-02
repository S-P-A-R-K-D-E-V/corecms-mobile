import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { haptics } from 'src/services/haptics';
import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { isHttpStatusError } from 'src/api/http-status-error';
import {
  startOrResumeSession,
  fetchSessionMessages,
  fetchCapabilities,
  sendAssistantMessage,
  retryAssistantMessage,
  type AssistantCapabilities,
} from 'src/api/assistant';
import { useAssistantCtx, type AssistantHubEvent } from 'src/components/assistant/assistant-provider';
import { imageErrorKey, isAttachmentRejection } from './image-attachments';
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
// "Cuộc trò chuyện mới" tạo phiên mới thật trên server (newSession) — lịch sử cũ không còn gửi cho model.
// ----------------------------------------------------------------------

/** sent = đã gửi; failed = lỗi mạng/khác (giữ ảnh để gửi lại); attachments_rejected = server từ chối ảnh (đã xoá). */
export type SendResult = 'sent' | 'failed' | 'attachments_rejected';

const SESSION_STORAGE_KEY = 'assistantSessionId';
const HISTORY_LIMIT = 50;
const REFETCH_LIMIT = 20;
const SILENCE_MS = 20_000;
const POLL_MS = 5_000;
const MAX_PENDING_MS = 6 * 60_000;

/**
 * GET /chatbot/capabilities khi mở màn. loaded=false lúc đang tải; capabilities=null = server cũ (404) / lỗi →
 * màn giữ cách chặn cũ, không có nút đính kèm ảnh.
 */
export function useAssistantCapabilities(active: boolean) {
  const [state, setState] = useState<{ loaded: boolean; capabilities: AssistantCapabilities | null }>({
    loaded: false,
    capabilities: null,
  });
  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    fetchCapabilities()
      .catch(() => null)
      .then((capabilities) => {
        if (alive) setState({ loaded: true, capabilities });
      });
    return () => {
      alive = false;
    };
  }, [active]);
  return state;
}

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
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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
        const session = await startOrResumeSession(storedSessionId, fresh ? { newSession: true } : undefined);
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

  /**
   * Gửi câu hỏi (+ objectKey ảnh đã PUT lên R2; localUris để hiện ảnh ngay). content được rỗng khi có ảnh.
   */
  const send = useCallback(
    async (raw: string, opts?: { attachments?: { objectKey: string }[]; localUris?: string[] }): Promise<SendResult> => {
      const content = raw.trim();
      const attachments = opts?.attachments?.length ? opts.attachments : undefined;
      const current = sessionIdRef.current;
      if ((!content && !attachments) || sending || !current) return 'failed';
      haptics.light();
      setSending(true);
      const localId = `${LOCAL_ID_PREFIX}${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: localId,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
          status: 'complete',
          localUris: attachments ? opts?.localUris : undefined,
        },
      ]);
      try {
        const result = await sendAssistantMessage(current, content, attachments);
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
        return 'sent';
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== localId));
        if (attachments && isAttachmentRejection(err)) {
          toast.error(t(`assistant.${imageErrorKey(err)}`));
          return 'attachments_rejected';
        }
        return 'failed';
      } finally {
        setSending(false);
      }
    },
    [sending, touch]
  );

  /**
   * Thử lại câu trả lời lỗi: server chạy lại trên CÙNG id tin (streamingStarted xoá phần cũ). Server cũ (404)
   * hoặc không thử lại được (409) → gửi lại câu hỏi cuối của người dùng.
   */
  const retry = useCallback(
    async (msg: ScreenMessage) => {
      if (!sessionIdRef.current || sending) return;
      const before = messagesRef.current.find((m) => m.id === msg.id);
      if (!before) return;
      const now = Date.now();
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id ? { ...m, status: 'pending', errorCode: null, streaming: true, pendingSince: now } : m
        )
      );
      touch();
      try {
        await retryAssistantMessage(msg.id);
      } catch (err) {
        // Trả lại trạng thái lỗi như trước (giữ phần đã trả lời).
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? before : m)));
        if (isHttpStatusError(err) && (err.status === 404 || err.status === 409)) {
          const list = messagesRef.current;
          const idx = list.findIndex((m) => m.id === msg.id);
          const lastUser = list
            .slice(0, idx === -1 ? list.length : idx)
            .reverse()
            .find((m) => m.role === 'user' && m.content.trim());
          if (lastUser && (await send(lastUser.content)) === 'sent') return;
        }
        toast.error(t('assistant.error'));
      }
    },
    [sending, send, touch]
  );

  return { messages, loading, sending, sessionId, stale, open, send, retry, refetch };
}
