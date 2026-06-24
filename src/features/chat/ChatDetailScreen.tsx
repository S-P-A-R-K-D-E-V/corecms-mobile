import { useCallback, useEffect, useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, TextInput, Image, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import dayjs from 'dayjs';

import { AppHeader, Loading } from 'src/components/shared';
import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { getStorageUrl } from 'src/api/axios';
import {
  fetchMessages,
  sendMessage,
  sendAttachment,
  markRead,
  type DirectMessage,
  type MessageAttachment,
  type ChatFile,
} from 'src/api/messenger';
import { useMessengerStore, selectMessages, selectTyping } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';
import { useMessengerCtx } from 'src/components/messenger/messenger-provider';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB — đồng bộ giới hạn BE

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentView({ att, isMine }: { att: MessageAttachment; isMine: boolean }) {
  const url = getStorageUrl(att.objectKey);
  if (att.kind === 'image') {
    return (
      <Pressable onPress={() => WebBrowser.openBrowserAsync(url)} className="mt-1">
        <Image source={{ uri: url }} className="w-52 h-52 rounded-xl" resizeMode="cover" />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(url)}
      className={cn(
        'mt-1 flex-row items-center gap-2 px-3 py-2.5 rounded-xl',
        isMine ? 'bg-white/15' : 'bg-bg dark:bg-bg-dark'
      )}
    >
      <Icon name="file-document-outline" size={26} tone={isMine ? 'inverse' : 'primary'} />
      <View className="flex-1">
        <Text className={cn('font-semibold', isMine && 'text-white')} numberOfLines={1}>{att.fileName}</Text>
        <Text variant="caption" className={isMine ? 'text-white/70' : 'text-faint'}>{formatSize(att.sizeBytes)}</Text>
      </View>
      <Icon name="download" size={18} tone={isMine ? 'inverse' : 'muted'} />
    </Pressable>
  );
}

function Bubble({ msg, isMine }: { msg: DirectMessage; isMine: boolean }) {
  const hasText = !!msg.content?.trim();
  const attachments = msg.attachments ?? [];
  return (
    <View className={cn('flex-row my-0.5', isMine ? 'justify-end' : 'justify-start')}>
      <View className={cn('max-w-[78%] px-3.5 py-2.5 rounded-2xl', isMine ? 'bg-primary' : 'bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark')}>
        {hasText ? <Text className={isMine ? 'text-white' : ''}>{msg.content}</Text> : null}
        {attachments.map((att, i) => (
          <AttachmentView key={att.objectKey + i} att={att} isMine={isMine} />
        ))}
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
  const { sendTyping, joinConversation, leaveConversation } = useMessengerCtx();

  const messages = useMessengerStore(selectMessages(conversationId!));
  const typing = useMessengerStore(selectTyping(conversationId!));
  const { setMessages, prependMessages, clearUnread } = useMessengerStore();

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const flatRef = useRef<FlatList<DirectMessage>>(null);

  useEffect(() => {
    joinConversation(conversationId!);
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
    return () => leaveConversation(conversationId!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

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
      await sendMessage(conversationId!, content); // arrives via SignalR "message"
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

  async function uploadFiles(files: ChatFile[]) {
    const tooBig = files.find((f) => (f as any).size && (f as any).size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      Alert.alert('Tệp quá lớn', 'Mỗi tệp không được vượt quá 10MB.');
      return;
    }
    setUploading(true);
    try {
      await sendAttachment(conversationId!, files, text.trim() || undefined);
      setText('');
    } catch {
      Alert.alert('Gửi thất bại', 'Không gửi được tệp. Vui lòng thử lại.');
    } finally {
      setUploading(false);
    }
  }

  async function pickImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Cần quyền thư viện ảnh', 'Vui lòng cấp quyền truy cập ảnh để gửi hình.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
    });
    if (result.canceled) return;
    const files: ChatFile[] = result.assets.map((a, i) => ({
      uri: a.uri,
      name: a.fileName ?? `image_${Date.now()}_${i}.jpg`,
      type: a.mimeType ?? 'image/jpeg',
    }));
    await uploadFiles(files.map((f, i) => ({ ...f, size: result.assets[i].fileSize } as any)));
  }

  async function pickDocuments() {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'text/csv',
      ],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const files = result.assets.map((a) => ({
      uri: a.uri,
      name: a.name,
      type: a.mimeType ?? 'application/octet-stream',
      size: a.size ?? undefined,
    })) as any[];
    await uploadFiles(files);
  }

  function handleAttachPress() {
    if (uploading || sending) return;
    Alert.alert('Đính kèm', 'Chọn loại tệp muốn gửi', [
      { text: 'Hình ảnh', onPress: pickImages },
      { text: 'Tệp (pdf, doc, xls…)', onPress: pickDocuments },
      { text: 'Huỷ', style: 'cancel' },
    ]);
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

        {uploading ? (
          <View className="flex-row items-center gap-2 px-4 py-1.5">
            <Spinner />
            <Text variant="caption" tone="muted">Đang gửi tệp…</Text>
          </View>
        ) : null}

        <View className="flex-row items-end gap-2 p-2 px-3 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
          <Pressable onPress={handleAttachPress} disabled={uploading || sending} className="w-11 h-11 items-center justify-center rounded-full">
            <Icon name="paperclip" size={24} tone={uploading || sending ? 'faint' : 'muted'} />
          </Pressable>
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
