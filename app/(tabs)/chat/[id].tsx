import { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TextInput as RNTextInput } from 'react-native';
import { Text, Avatar, IconButton, useTheme, ActivityIndicator, Surface } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import dayjs from 'dayjs';

import { fetchMessages, sendMessage, markRead } from 'src/api/messenger';
import { useMessengerStore, selectMessages } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';
import { useSignalR } from 'src/hooks/use-signalr';
import type { DirectMessage } from 'src/api/messenger';

// ----------------------------------------------------------------------

function MessageBubble({ msg, isMine }: { msg: DirectMessage; isMine: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      <Surface
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: theme.colors.primary }
            : { backgroundColor: theme.colors.surfaceVariant },
        ]}
        elevation={0}
      >
        <Text
          variant="bodyMedium"
          style={{ color: isMine ? '#fff' : theme.colors.onSurface }}
        >
          {msg.content}
        </Text>
        <Text
          variant="bodySmall"
          style={{
            color: isMine ? 'rgba(255,255,255,0.65)' : theme.colors.onSurfaceVariant,
            fontSize: 10,
            textAlign: 'right',
            marginTop: 3,
          }}
        >
          {dayjs(msg.createdAt).format('HH:mm')}
        </Text>
      </Surface>
    </View>
  );
}

// ----------------------------------------------------------------------

export default function ChatScreen() {
  const { id: conversationId, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { user } = useAuthContext();
  const theme = useTheme();
  const navigation = useNavigation();
  const { sendTyping } = useSignalR();

  const messages = useMessengerStore(selectMessages(conversationId));
  const { setMessages, prependMessages, clearUnread } = useMessengerStore();

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const flatRef = useRef<FlatList<DirectMessage>>(null);

  // Set header title
  useEffect(() => {
    navigation.setOptions({ title: name || 'Chat' });
  }, [name, navigation]);

  // Load initial messages
  useEffect(() => {
    (async () => {
      try {
        const msgs = await fetchMessages(conversationId, { limit: 50 });
        setMessages(conversationId, msgs);
        await markRead(conversationId);
        clearUnread(conversationId);
      } catch {}
    })();
  }, [conversationId, setMessages, clearUnread]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const older = await fetchMessages(conversationId, { limit: 30, before: oldest.id });
      if (older.length === 0) {
        setHasMore(false);
      } else {
        prependMessages(conversationId, older);
      }
    } catch {
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, messages, conversationId, prependMessages]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(conversationId, content);
      // Message will arrive via SignalR ReceiveMessage event
    } catch {
      setText(content); // restore on failure
    } finally {
      setSending(false);
    }
  }

  function handleTyping(value: string) {
    setText(value);
    if (value.length > 0) sendTyping(conversationId);
  }

  const reversed = [...messages].reverse();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatRef}
          data={reversed}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.messageList}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 8 }} />
            ) : null
          }
          renderItem={({ item }) => (
            <MessageBubble msg={item} isMine={item.senderId === user?.id} />
          )}
        />

        {/* Input Bar */}
        <View style={[styles.inputBar, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.outline }]}>
          <RNTextInput
            value={text}
            onChangeText={handleTyping}
            placeholder="Nhập tin nhắn..."
            placeholderTextColor={theme.colors.onSurfaceVariant}
            style={[styles.textInput, { color: theme.colors.onSurface, backgroundColor: theme.colors.surfaceVariant }]}
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <IconButton
            icon="send"
            iconColor={text.trim() ? theme.colors.primary : theme.colors.onSurfaceVariant}
            size={24}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={styles.sendBtn}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  messageList: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubbleRowMine: { justifyContent: 'flex-end' },
  bubbleRowTheirs: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '75%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingHorizontal: 12,
    borderTopWidth: 1,
    gap: 4,
  },
  textInput: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendBtn: { margin: 0 },
});
