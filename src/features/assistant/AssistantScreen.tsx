import { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, TextInput, Keyboard } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import dayjs from 'dayjs';

import { Loading } from 'src/components/shared';
import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { haptics } from 'src/services/haptics';
import {
  startOrResumeSession,
  fetchSessionMessages,
  sendAssistantMessage,
  type AssistantMessage,
} from 'src/api/assistant';
import { useAssistantCtx, type AssistantHubEvent } from 'src/components/assistant/assistant-provider';

// ----------------------------------------------------------------------
// Tab "Trợ lý" — AI Chat tự-tra-cứu (lương, lý do phạt, lịch làm, đăng ký ca,
// đổi ca/làm hộ), KHÁC HOÀN TOÀN tab "Chat" nhắn tin nội bộ. BE tự giới hạn
// phạm vi dữ liệu về đúng người đang hỏi theo JWT — không cần truyền staffId,
// không thể tra cứu người khác (xem StaffPreamble phía BE).
// ----------------------------------------------------------------------

const SESSION_STORAGE_KEY = 'assistantSessionId';

type ScreenMessage = AssistantMessage & { streaming?: boolean; statusLabel?: string };

function TypingBubble({ label }: { label?: string }) {
  return (
    <View className="flex-row justify-start my-1">
      <View className="flex-row items-center gap-2 px-4 py-3 rounded-2xl bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark">
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.3, translateY: 0 }}
            animate={{ opacity: 1, translateY: -3 }}
            transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 420, delay: i * 140 }}
            className="w-1.5 h-1.5 rounded-full bg-muted"
          />
        ))}
        {label ? <Text variant="caption" tone="muted">{label}</Text> : null}
      </View>
    </View>
  );
}

function Bubble({ msg }: { msg: ScreenMessage }) {
  const isMine = msg.role === 'user';
  return (
    <View className={cn('flex-row my-0.5', isMine ? 'justify-end' : 'justify-start')}>
      <View
        className={cn(
          'max-w-[82%] px-3.5 py-2.5 rounded-2xl',
          isMine ? 'bg-primary' : 'bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark'
        )}
      >
        <Text className={isMine ? 'text-white' : ''}>{msg.content || (msg.streaming ? '…' : '')}</Text>
        <Text className={cn('text-[10px] text-right mt-1', isMine ? 'text-white/65' : 'text-faint')}>
          {dayjs(msg.createdAt).format('HH:mm')}
        </Text>
      </View>
    </View>
  );
}

export function AssistantScreen() {
  const insets = useSafeAreaInsets();
  const { joinSession, leaveSession, subscribe } = useAssistantCtx();

  const [messages, setMessages] = useState<ScreenMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [kbUp, setKbUp] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const flatRef = useRef<FlatList<ScreenMessage>>(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKbUp(true));
    const h = Keyboard.addListener(hideEvt, () => setKbUp(false));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const upsertStreamingMessage = useCallback((messageId: string, patch: Partial<ScreenMessage>) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === messageId);
      if (idx === -1) {
        return [
          ...prev,
          { id: messageId, role: 'assistant', content: '', createdAt: new Date().toISOString(), streaming: true, ...patch },
        ];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let currentSessionId: string | null = null;

    (async () => {
      try {
        const storedSessionId = (await SecureStore.getItemAsync(SESSION_STORAGE_KEY)) || undefined;
        const session = await startOrResumeSession(storedSessionId);
        if (!mounted) return;
        currentSessionId = session.sessionId;
        sessionIdRef.current = session.sessionId;
        await SecureStore.setItemAsync(SESSION_STORAGE_KEY, session.sessionId);
        await joinSession(session.sessionId);
        const history = await fetchSessionMessages(session.sessionId, 50);
        if (mounted) setMessages(history);
      } catch {
        /* để trống, người dùng vẫn gõ được — sẽ tạo phiên mới khi gửi thất bại lần đầu */
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const unsubscribe = subscribe((ev: AssistantHubEvent) => {
      if (!currentSessionId || ev.sessionId !== currentSessionId) return;
      switch (ev.type) {
        case 'streamingStarted':
          upsertStreamingMessage(ev.messageId, { streaming: true, content: '' });
          break;
        case 'chunk':
          setMessages((prev) => {
            const idx = prev.findIndex((m) => m.id === ev.messageId);
            if (idx === -1) return prev;
            const next = [...prev];
            next[idx] = { ...next[idx], content: (next[idx].content || '') + ev.content, statusLabel: undefined };
            return next;
          });
          break;
        case 'status':
          upsertStreamingMessage(ev.messageId, { statusLabel: ev.label || ev.name || ev.phase });
          break;
        case 'completed':
          upsertStreamingMessage(ev.messageId, { content: ev.content, streaming: false, statusLabel: undefined });
          break;
        case 'error':
          upsertStreamingMessage(ev.messageId, {
            content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.',
            streaming: false,
            statusLabel: undefined,
          });
          break;
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
      if (currentSessionId) leaveSession(currentSessionId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSend() {
    const content = text.trim();
    const sessionId = sessionIdRef.current;
    if (!content || sending || !sessionId) return;
    haptics.light();
    setSending(true);
    setText('');
    const userMsg: ScreenMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    try {
      const result = await sendAssistantMessage(sessionId, content);
      if (result.fromCache && result.cachedAnswer) {
        upsertStreamingMessage(result.assistantMessageId, {
          content: result.cachedAnswer,
          streaming: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Placeholder — nội dung thật sẽ đến qua SignalR (streamingStarted/chunk/completed).
        upsertStreamingMessage(result.assistantMessageId, {
          content: '',
          streaming: true,
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
      setText(content);
    } finally {
      setSending(false);
    }
  }

  const streamingLabel = messages.find((m) => m.streaming)?.statusLabel;
  const isAssistantTyping = messages.some((m) => m.streaming && !m.content);

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 pb-2 flex-row items-center gap-2 border-b border-line dark:border-line-dark">
        <View className="w-9 h-9 items-center justify-center rounded-full bg-primary-soft">
          <Icon name="robot-outline" size={20} tone="primary" />
        </View>
        <View className="flex-1">
          <Text variant="subtitle">Trợ lý CiCi</Text>
          <Text variant="caption" tone="muted">Tra lương, lịch làm, đổi ca — chỉ của riêng bạn</Text>
        </View>
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {loading ? (
          <Loading />
        ) : (
          <FlatList
            ref={flatRef}
            data={[...messages].reverse()}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerClassName="px-3 py-2"
            ListHeaderComponent={isAssistantTyping ? <TypingBubble label={streamingLabel} /> : null}
            renderItem={({ item }) => <Bubble msg={item} />}
          />
        )}

        <View
          className="flex-row items-end gap-2 p-2 px-3 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark"
          style={{ paddingBottom: kbUp ? 8 : Math.max(insets.bottom, 8) }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Hỏi về lương, lịch làm, đổi ca…"
            placeholderTextColor={brand.faint}
            multiline
            maxLength={1000}
            className="flex-1 rounded-3xl px-4 py-2.5 text-[15px] text-ink dark:text-ink-dark bg-bg dark:bg-bg-dark max-h-32"
          />
          <Pressable onPress={handleSend} disabled={!text.trim() || sending} className="w-11 h-11 items-center justify-center rounded-full">
            {sending ? <Spinner /> : <Icon name="send" size={24} tone={text.trim() ? 'primary' : 'faint'} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
