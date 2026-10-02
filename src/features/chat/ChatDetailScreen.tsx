import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, FlatList, KeyboardAvoidingView, Platform, TextInput, Image, Keyboard } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

import { Loading } from 'src/components/shared';
import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { ChatAvatar } from './ChatAvatar';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { showActionSheet, toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { t } from 'src/i18n';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

function DayChip({ iso }: { iso: string }) {
  const d = dayjs(iso);
  const label = d.isToday() ? 'Hôm nay' : d.isYesterday() ? 'Hôm qua' : d.format('DD/MM/YYYY');
  return (
    <View className="items-center my-2">
      <View className="px-3 py-1 rounded-full bg-ink/5 dark:bg-white/10">
        <Text variant="caption" tone="muted" className="font-semibold">{label}</Text>
      </View>
    </View>
  );
}

function TypingBubble() {
  return (
    <View className="flex-row justify-start my-1">
      <View className="flex-row items-center gap-1 px-4 py-3 rounded-2xl bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark">
        {[0, 1, 2].map((i) => (
          <MotiView
            key={i}
            from={{ opacity: 0.3, translateY: 0 }}
            animate={{ opacity: 1, translateY: -3 }}
            transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 420, delay: i * 140 }}
            // MotiView không nhận className (NativeWind) — kích thước/màu qua style.
            style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: brand.muted }}
          />
        ))}
      </View>
    </View>
  );
}
import { getStorageUrl } from 'src/api/axios';
import {
  fetchMessages,
  sendMessage,
  markRead,
  isGroupConversation,
  type DirectMessage,
  type MessageAttachment,
} from 'src/api/messenger';
import { useMessengerStore, selectMessages, selectTyping } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';
import { useMessengerCtx } from 'src/components/messenger/messenger-provider';
import { ImageViewer, type ViewerImage } from './ImageViewer';
import { AttachmentOutboxBar } from './AttachmentOutboxBar';
import { useAttachmentOutbox } from './useAttachmentOutbox';
import { canProcessImages, type PickedAttachment } from './attachment-prepare';
import { DOCUMENT_PICKER_TYPES, MAX_FILES_PER_MESSAGE, formatBytes } from './attachment-rules';

/** Mở tệp (không phải ảnh) trong trình xem in-app (SFSafariVC / Custom Tabs). */
function openFileInApp(url: string) {
  WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    controlsColor: brand.primary,
    toolbarColor: '#FFFFFF',
    enableBarCollapsing: true,
  }).catch(() => {});
}

function AttachmentView({ att, isMine, onOpenImage }: { att: MessageAttachment; isMine: boolean; onOpenImage: (objectKey: string) => void }) {
  const url = getStorageUrl(att.objectKey);
  if (att.kind === 'image') {
    return (
      <Pressable onPress={() => onOpenImage(att.objectKey)} className="mt-1">
        <Image source={{ uri: url }} className="w-52 h-52 rounded-xl" resizeMode="cover" />
      </Pressable>
    );
  }
  return (
    <Pressable
      onPress={() => openFileInApp(url)}
      className={cn(
        'mt-1 flex-row items-center gap-2 px-3 py-2.5 rounded-xl',
        isMine ? 'bg-white/15' : 'bg-bg dark:bg-bg-dark'
      )}
    >
      <Icon name="file-document-outline" size={26} tone={isMine ? 'inverse' : 'primary'} />
      <View className="flex-1">
        <Text className={cn('font-semibold', isMine && 'text-white')} numberOfLines={1}>{att.fileName}</Text>
        <Text variant="caption" className={isMine ? 'text-white/70' : 'text-faint'}>{formatBytes(att.sizeBytes)}</Text>
      </View>
      <Icon name="download" size={18} tone={isMine ? 'inverse' : 'muted'} />
    </Pressable>
  );
}

function Bubble({ msg, isMine, onOpenImage }: { msg: DirectMessage; isMine: boolean; onOpenImage: (objectKey: string) => void }) {
  const hasText = !!msg.content?.trim();
  const attachments = msg.attachments ?? [];
  return (
    <View className={cn('flex-row my-0.5', isMine ? 'justify-end' : 'justify-start')}>
      <View className={cn('max-w-[78%] px-3.5 py-2.5 rounded-2xl', isMine ? 'bg-primary' : 'bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark')}>
        {hasText ? <Text className={isMine ? 'text-white' : ''}>{msg.content}</Text> : null}
        {attachments.map((att, i) => (
          <AttachmentView key={att.objectKey + i} att={att} isMine={isMine} onOpenImage={onOpenImage} />
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
  const { setMessages, prependMessages, clearUnread, setActiveConversation } = useMessengerStore();

  // Đối tác trò chuyện (để hiện avatar + trạng thái trên header).
  const conv = useMessengerStore((s) => s.conversations.find((c) => c.id === conversationId));
  const userCache = useMessengerStore((s) => s.userCache);
  const isPrivate = !isGroupConversation(conv?.type);
  const otherId = conv?.participantIds.find((id) => id !== user?.id);
  const other = otherId ? userCache[otherId] : undefined;
  const headerName = name || other?.fullName || 'Chat';

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // Gửi ảnh/tệp: presigned URL → PUT thẳng lên R2 → gửi tin kèm objectKey (không qua API).
  const attachments = useAttachmentOutbox(conversationId!);
  const uploading = attachments.busy;
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [kbUp, setKbUp] = useState(false);
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const flatRef = useRef<FlatList<DirectMessage>>(null);

  // Gom mọi ảnh trong hội thoại (thứ tự thời gian) để xem/vuốt như gallery.
  const gallery = useMemo<(ViewerImage & { key: string })[]>(() => {
    const arr: (ViewerImage & { key: string })[] = [];
    for (const m of messages) {
      for (const a of m.attachments ?? []) {
        if (a.kind === 'image') arr.push({ uri: getStorageUrl(a.objectKey), fileName: a.fileName, key: a.objectKey });
      }
    }
    return arr;
  }, [messages]);

  const openImage = useCallback(
    (objectKey: string) => {
      const i = gallery.findIndex((g) => g.key === objectKey);
      setViewer({ open: true, index: i < 0 ? 0 : i });
    },
    [gallery]
  );

  // Bàn phím hiện → thu gọn đệm an toàn dưới ô nhập để nó sát bàn phím
  // (trước đây paddingBottom = safe-area luôn hằng → ô input cách bàn phím xa).
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, () => setKbUp(true));
    const h = Keyboard.addListener(hideEvt, () => setKbUp(false));
    return () => { s.remove(); h.remove(); };
  }, []);

  useEffect(() => {
    joinConversation(conversationId!);
    setActiveConversation(conversationId!); // bỏ qua thông báo tin nhắn của cuộc đang mở
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
    return () => {
      leaveConversation(conversationId!);
      setActiveConversation(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      // BE nhận `before` là MỐC THỜI GIAN (DateTime), KHÔNG phải message id —
      // truyền id sẽ bind lỗi → BE trả lại tin mới nhất → loadMore lặp vô hạn (loading liên tục).
      const older = await fetchMessages(conversationId!, { limit: 30, before: messages[0].createdAt });
      if (older.length === 0) setHasMore(false);
      else prependMessages(conversationId!, older);
    } catch {} finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, messages, conversationId, prependMessages]);

  async function handleSend() {
    const content = text.trim();
    if (!content || sending) return;
    haptics.light();
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

  /** Chữ đang gõ đi kèm làm chú thích; gửi không được thì trả lại ô nhập. */
  async function sendPicked(picked: PickedAttachment[]) {
    const caption = text.trim();
    setText('');
    const started = await attachments.start(picked, caption);
    if (!started && caption) setText((cur) => cur || caption);
  }

  function discardAttachments() {
    const caption = attachments.discard();
    if (caption) setText((cur) => cur || caption);
  }

  async function pickImages() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error(t('chat.attach.permission'), t('chat.attach.permissionTitle'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_FILES_PER_MESSAGE,
      // iOS mặc định trả nguyên ảnh HEIC (bỏ qua quality) → server/Android/web không nhận; xin bản JPEG tương thích.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      // Có bộ nén → lấy chất lượng gốc rồi tự thu nhỏ + nén một lần; bản app cũ chưa có → để picker nén.
      quality: canProcessImages() ? 1 : 0.8,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    await sendPicked(
      result.assets.map((a) => ({
        uri: a.uri,
        name: a.fileName,
        mimeType: a.mimeType,
        size: a.fileSize,
        width: a.width,
        height: a.height,
        source: 'image' as const,
      }))
    );
  }

  async function pickDocuments() {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCUMENT_PICKER_TYPES,
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    await sendPicked(
      result.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size, source: 'document' as const }))
    );
  }

  function handleAttachPress() {
    if (uploading || sending) return;
    showActionSheet({
      title: t('chat.attach.title'),
      message: t('chat.attach.subtitle'),
      options: [
        { label: t('chat.attach.images'), icon: 'image-multiple-outline', onPress: pickImages },
        { label: t('chat.attach.files'), icon: 'file-document-outline', onPress: pickDocuments },
      ],
    });
  }

  const reversed = [...messages].reverse();

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 pb-1 flex-row items-center gap-2">
        <Pressable onPress={() => router.back()} className="w-9 h-9 -ml-1 items-center justify-center rounded-full">
          <Icon name="chevron-left" size={26} tone="default" />
        </Pressable>
        <ChatAvatar
          name={headerName}
          avatarUrl={isPrivate ? other?.avatarUrl : null}
          size={40}
          online={isPrivate && (other?.online ?? false)}
        />
        <View className="flex-1">
          <Text variant="subtitle" numberOfLines={1}>{headerName}</Text>
          {typing.length > 0 ? (
            <Text variant="caption" tone="primary">Đang nhập...</Text>
          ) : isPrivate ? (
            <Text variant="caption" tone={other?.online ? 'primary' : 'muted'}>
              {other?.online ? 'Đang hoạt động' : 'Ngoại tuyến'}
            </Text>
          ) : null}
        </View>
      </View>
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
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
            ListHeaderComponent={typing.length > 0 ? <TypingBubble /> : null}
            ListFooterComponent={loadingMore ? <View className="py-2"><Spinner /></View> : null}
            renderItem={({ item, index }) => {
              const older = reversed[index + 1];
              const showDate = !older || !dayjs(older.createdAt).isSame(item.createdAt, 'day');
              return (
                <>
                  {showDate ? <DayChip iso={item.createdAt} /> : null}
                  <Bubble msg={item} isMine={item.senderId === user?.id} onOpenImage={openImage} />
                </>
              );
            }}
          />
        )}

        <AttachmentOutboxBar outbox={attachments.outbox} onRetry={attachments.retry} onDiscard={discardAttachments} />

        <View
          className="flex-row items-end gap-2 p-2 px-3 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark"
          style={{ paddingBottom: kbUp ? 8 : Math.max(insets.bottom, 8) }}
        >
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

      {viewer.open ? (
        <ImageViewer
          images={gallery}
          initialIndex={viewer.index}
          visible
          onClose={() => setViewer({ open: false, index: 0 })}
        />
      ) : null}
    </View>
  );
}
