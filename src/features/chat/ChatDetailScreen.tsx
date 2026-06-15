import { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { AppHeader, Loading } from 'src/components/shared';
import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { fetchMessages, sendMessage, markRead, type DirectMessage } from 'src/api/messenger';
import { useMessengerStore, selectMessages, selectTyping } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';
import { useSignalR } from 'src/hooks/use-signalr';

function Bubble({ msg, isMine }: { msg: DirectMessage; isMine: boolean }) {
  return (
    <View className={cn('flex-row my-0.5', isMine ? 'justify-end' : 'justify-start')}>
      <View className={cn('max-w-[78%] px-3.5 py-2.5 rounded-2xl', isMine ? 'bg-primary' : 'bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark')}>
        <Text className={isMine ? 'text-white' : ''}>{msg.content}</Text>
        <Text className={cn('text-[10px] text-right mt-1', isMine ? 'text-white/65' : 'text-faint')}>
          {dayjs(msg.createdAt).format('HH:mm')}
        </Text>
      </View>
    </View>
  );
}

export function ChatDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id: conversationId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { user } = useAuthContext();
  const { sendTyping } = useSignalR();

  const messages = useMessengerStore(selectMessages(conversationId!));
  const typing = useMessengerStore(selectTyping(conversationId!));
  const { setMessages, prependMessages, clearUnread } = useMessengerStore();

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const flatRef = useRef<FlatList<DirectMessage>>(null);

  useEffect(() => {
    (async () => {
      try {
        const msgs = await fetchMessages(conversationId!, { limit: 50 });
        setMessages(conversationId!, msgs);
        await markRead(conversationId!);
        clearUnread(conversationId!);
      } catch {} finally {
        setLoading(false);
      }
    })();
  }, [conversationId, setMessages, clearUnread]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const older = await fetchMessages(conversationId!, { limit: 30, before: messages[0].id });
      if (older.length === 0) setHasMore(false);
      else prependMessages(conversationId!, older);
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, messages, conversationId, prependMessages]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(conversationId!, content); // arrives via SignalR ReceiveMessage
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  }

  function handleTyping(v: string) {
    setText(v);
    if (v.length > 0) sendTyping(conversationId!);
  }

  const reversed = [...messages].reverse();

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="px-4 pt-2">
        <AppHeader title={name || 'Chat'} subtitle={typing.length > 0 ? 'Đang nhập...' : undefined} back />
      </View>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        {loading ? (
          <Loading />
        ) : (
          <FlatList
            ref={flatRef}
            data={reversed}
            keyExtractor={(i) => i.id}
            inverted
            contentContainerClassName="px-3 py-2"
            onEndReached={loadMore}
            onEndReachedThreshold={0.3}
            ListFooterComponent={loadingMore ? <View className="py-2"><Spinner /></View> : null}
            renderItem={({ item }) => <Bubble msg={item} isMine={item.senderId === user?.id} />}
          />
        )}

        <View className="flex-row items-end gap-2 p-2 px-3 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
          <TextInput
            value={text}
            onChangeText={handleTyping}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor={brand.faint}
            multiline
            maxLength={2000}
            className="flex-1 rounded-3xl px-4 py-2.5 text-[15px] text-ink dark:text-ink-dark bg-bg dark:bg-bg-dark max-h-32"
          />
          <Pressable onPress={handleSend} disabled={!text.trim() || sending} className="w-11 h-11 items-center justify-center rounded-full">
            <Icon name="send" size={24} tone={text.trim() ? 'primary' : 'faint'} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
