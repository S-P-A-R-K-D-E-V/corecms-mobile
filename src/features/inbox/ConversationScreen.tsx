import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import dayjs from 'dayjs';

import { ErrorView, Loading } from 'src/components/shared';
import { Badge, Button, Chip, Icon, Pressable, Spinner, Text } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { confirm, showActionSheet, toast, type ActionItem } from 'src/components/overlay';
import { brand } from 'src/theme';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { useAuthContext } from 'src/auth/auth-context';
import { hasPermission, PERMISSIONS } from 'src/auth/permissions';
import { useScreenActive } from 'src/features/agent-tasks/hooks';
import { openInAppBrowser } from 'src/features/assistant/links';
import { ImageViewer } from 'src/features/chat/ImageViewer';
import { imagePickerQuality, pickedImage, prepareAttachment } from 'src/features/chat/attachment-prepare';
import { putFileToPresignedUrl } from 'src/services/upload/presigned-put';
import {
  hideComment,
  markConversationRead,
  markConversationUnread,
  presignConversationImage,
  privateReply,
  releaseConversation,
  sendConversationMessage,
  setConversationStatus,
  setConversationTags,
  takeConversation,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationStatus,
  type QuickReply,
} from 'src/api/inbox';

import { InboxAvatar } from './InboxAvatar';
import { MessageBubble } from './MessageBubble';
import { CustomerSheet } from './CustomerSheet';
import { QuickReplySheet } from './QuickReplySheet';
import {
  MESSAGE_MAX_LENGTH,
  NOT_SUPPORTED_MESSAGE,
  applyQuickReplyText,
  facebookPostUrl,
  flattenMessages,
  holderActions,
  holderLabel,
  holderTone,
  inboxErrorKind,
  isPriority,
  maxImagesFor,
  togglePriorityTag,
  windowWarning,
  type HolderAction,
} from './inbox-format';
import {
  applyConversation,
  applyMessage,
  detailKey,
  invalidateCounts,
  patchConversation,
  useConversationDetail,
  useConversationMessages,
  useRefetchOnReconnect,
} from './hooks';
import { useInboxHub } from './inbox-hub';

// ----------------------------------------------------------------------
// Một hội thoại của Hộp thư khách: thanh người giữ (Tôi trả lời / Trả về hàng chờ / Giao lại cho agent / Giành quyền), menu
// (Ưu tiên, Đánh dấu chưa đọc, Hoàn tất / Mở lại, Spam, Xem bài viết), các tin, ô gõ (ảnh, mẫu trả lời nhanh, ghi chú nội bộ;
// bình luận: Trả lời công khai / Nhắn riêng). Mở là đánh dấu đã đọc. canReply false → hiện lý do, chỉ ghi chú được.
// ----------------------------------------------------------------------

type PendingImage = { localUri: string; publicUrl: string | null };
type ReplyMode = 'public' | 'private';

const ACTION_LABEL: Record<HolderAction, { label: string; icon: 'hand-back-right-outline' | 'tray-arrow-down' | 'robot-outline' | 'account-arrow-left-outline' }> = {
  take: { label: 'Tôi trả lời', icon: 'hand-back-right-outline' },
  'force-take': { label: 'Giành quyền', icon: 'account-arrow-left-outline' },
  release: { label: 'Trả về hàng chờ', icon: 'tray-arrow-down' },
  'to-agent': { label: 'Giao lại cho agent', icon: 'robot-outline' },
};

function DayChip({ iso }: { iso: string }) {
  const d = dayjs(iso);
  const today = dayjs();
  const label = d.isSame(today, 'day') ? 'Hôm nay' : d.isSame(today.subtract(1, 'day'), 'day') ? 'Hôm qua' : d.format('DD/MM/YYYY');
  return (
    <View className="items-center my-2">
      <View className="px-3 py-1 rounded-full bg-ink/5 dark:bg-white/10">
        <Text variant="caption" tone="muted" className="font-semibold">{label}</Text>
      </View>
    </View>
  );
}

export function ConversationScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const myUserId = user?.id ?? null;
  const perms = {
    reply: hasPermission(user, PERMISSIONS.conversation.reply),
    manage: hasPermission(user, PERMISSIONS.conversation.manage),
  };
  const active = useScreenActive();
  useInboxHub(myUserId);

  const detailQuery = useConversationDetail(id, active);
  const messagesQuery = useConversationMessages(id, active);
  useRefetchOnReconnect(() => {
    detailQuery.refetch();
    messagesQuery.refetch();
  });
  const detail = detailQuery.data;
  const messages = useMemo(() => flattenMessages(messagesQuery.data?.pages), [messagesQuery.data]);
  const reversed = useMemo(() => [...messages].reverse(), [messages]);

  const [draft, setDraft] = useState('');
  const [noteMode, setNoteMode] = useState(false);
  const [replyMode, setReplyMode] = useState<ReplyMode>('public');
  const [images, setImages] = useState<PendingImage[]>([]);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState<HolderAction | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [viewer, setViewer] = useState<{ open: boolean; index: number }>({ open: false, index: 0 });
  const [kbUp, setKbUp] = useState(false);
  const inputRef = useRef<TextInput>(null);

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

  // ── Đánh dấu đã đọc: khi mở, và khi có tin khách mới lúc đang xem. Vừa bấm "Đánh dấu chưa đọc" thì thôi.
  const suppressRead = useRef(false);
  const lastRead = useRef<string | null>(null);
  const reading = useRef(false);
  const latestInbound = useMemo(() => [...messages].reverse().find((m) => m.direction === 'in')?.id ?? '', [messages]);
  const unreadCount = detail?.unreadCount ?? 0;
  useEffect(() => {
    if (!id || !active || !detail || suppressRead.current || reading.current) return;
    // Lần đầu mở, có tin khách mới, hoặc máy chủ còn báo chưa đọc.
    if (lastRead.current === latestInbound && unreadCount <= 0) return;
    lastRead.current = latestInbound;
    reading.current = true;
    markConversationRead(id)
      .then(() => {
        patchConversation(qc, id, { unreadCount: 0 });
        invalidateCounts(qc);
      })
      .catch(() => {})
      .finally(() => {
        reading.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, active, !!detail, latestInbound, unreadCount, qc]);

  const gallery = useMemo(
    () => messages.flatMap((m) => m.attachments.filter((a) => a.type === 'image').map((a) => ({ uri: a.url }))),
    [messages]
  );
  const openImage = useCallback(
    (url: string) => {
      const i = gallery.findIndex((g) => g.uri === url);
      setViewer({ open: true, index: i < 0 ? 0 : i });
    },
    [gallery]
  );

  if (!id) return null;

  if (detailQuery.isLoading) {
    return (
      <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
        <Loading />
      </View>
    );
  }
  if (detailQuery.isError || !detail) {
    return (
      <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top + 24 }}>
        <ErrorView message="Không mở được hội thoại (có thể đã bị xoá hoặc bạn không có quyền)." onRetry={() => detailQuery.refetch()} />
        <Button variant="ghost" onPress={() => router.back()}>Quay lại</Button>
      </View>
    );
  }

  const conv: ConversationDetail = detail;
  const isComment = conv.kind === 'comment';
  const privateMode = isComment && replyMode === 'private' && !noteMode;
  const realSendBlocked = !conv.canReply && !noteMode;
  const warning = !isComment && !noteMode ? windowWarning(conv.windowEndsAt) : null;
  const uploading = images.some((i) => !i.publicUrl);
  const maxImages = noteMode ? 10 : maxImagesFor(conv.kind);
  const canSend =
    perms.reply &&
    !sending &&
    !uploading &&
    !realSendBlocked &&
    (draft.trim().length > 0 || (!privateMode && images.length > 0));

  // ── Người giữ.
  async function runHolder(action: HolderAction) {
    if (busy) return;
    if (action === 'force-take') {
      const ok = await confirm({
        title: 'Giành quyền trả lời?',
        message: `${holderLabel(conv.holder, myUserId)}. Giành quyền thì người đó không gửi được nữa.`,
        confirmText: 'Giành quyền',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      const next =
        action === 'take' || action === 'force-take'
          ? await takeConversation(conv.id, action === 'force-take')
          : await releaseConversation(conv.id, action === 'to-agent' ? 'agent' : 'none');
      applyConversation(qc, next, myUserId);
      haptics.light();
      if (action === 'to-agent') toast.success('Đã giao lại cho agent CSKH.');
      if (action === 'release') toast.success('Đã trả hội thoại về hàng chờ.');
    } catch (err) {
      const kind = inboxErrorKind(err);
      if (kind === 'agent-off') toast.error('Agent CSKH chưa bật cho hộp thư — bật ở web: Hộp thư khách → Cài đặt.');
      else if (kind === 'held-by-other') {
        toast.error(extractApiError(err));
        detailQuery.refetch();
      } else toast.error(extractApiError(err));
    } finally {
      setBusy(null);
    }
  }

  // ── Menu.
  async function setStatus(status: ConversationStatus) {
    if (status === 'spam') {
      const ok = await confirm({
        title: 'Đánh dấu spam?',
        message: 'Hội thoại chuyển sang mục Spam, không gửi tin được nữa. Khách nhắn lại thì tự mở.',
        confirmText: 'Đánh dấu spam',
        destructive: true,
      });
      if (!ok) return;
    }
    try {
      applyConversation(qc, await setConversationStatus(conv.id, status), myUserId);
      qc.invalidateQueries({ queryKey: detailKey(conv.id) });
      toast.success(status === 'open' ? 'Đã mở lại hội thoại.' : status === 'closed' ? 'Đã hoàn tất hội thoại.' : 'Đã chuyển vào Spam.');
    } catch (err) {
      toast.error(extractApiError(err));
    }
  }

  async function togglePriority() {
    try {
      applyConversation(qc, await setConversationTags(conv.id, togglePriorityTag(conv.tags)), myUserId);
    } catch (err) {
      toast.error(extractApiError(err));
    }
  }

  async function markUnread() {
    try {
      await markConversationUnread(conv.id);
      suppressRead.current = true;
      patchConversation(qc, conv.id, { unreadCount: Math.max(1, conv.unreadCount) });
      invalidateCounts(qc);
      router.back();
    } catch (err) {
      toast.error(inboxErrorKind(err) === 'not-supported' ? NOT_SUPPORTED_MESSAGE : extractApiError(err));
    }
  }

  function openMenu() {
    const postUrl = isComment ? facebookPostUrl(conv.postId) : null;
    const options: ActionItem[] = [{ label: 'Thông tin khách', icon: 'account-details-outline', onPress: () => setCustomerOpen(true) }];
    if (perms.reply) {
      options.push({
        label: isPriority(conv) ? 'Bỏ ưu tiên' : 'Đánh dấu ưu tiên',
        icon: isPriority(conv) ? 'star-off-outline' : 'star-outline',
        onPress: togglePriority,
      });
    }
    options.push({ label: 'Đánh dấu chưa đọc', icon: 'email-mark-as-unread', onPress: markUnread });
    if (perms.reply) {
      options.push(
        conv.status === 'open'
          ? { label: 'Hoàn tất', icon: 'check-circle-outline', onPress: () => setStatus('closed') }
          : { label: 'Mở lại', icon: 'restore', onPress: () => setStatus('open') }
      );
      if (conv.status !== 'spam') options.push({ label: 'Spam', icon: 'alert-octagon-outline', destructive: true, onPress: () => setStatus('spam') });
    }
    if (postUrl) options.push({ label: 'Xem bài viết trên Facebook', icon: 'facebook', onPress: () => openInAppBrowser(postUrl) });
    showActionSheet({ title: conv.customer.name, options });
  }

  // ── Bình luận: ẩn / hiện.
  async function toggleHidden(m: ConversationMessage) {
    try {
      applyMessage(qc, await hideComment(conv.id, m.id, m.status !== 'hidden'), 'update');
    } catch (err) {
      toast.error(inboxErrorKind(err) === 'not-supported' ? NOT_SUPPORTED_MESSAGE : extractApiError(err));
    }
  }

  // ── Ảnh: chọn → nén / bỏ vị trí → xin URL → PUT lên R2 → gửi kèm publicUrl.
  async function pickImages() {
    const room = maxImages - images.length;
    if (room <= 0) {
      toast.warning(isComment && !noteMode ? 'Trả lời bình luận chỉ gửi được 1 ảnh.' : `Tối đa ${maxImages} ảnh mỗi lần gửi.`);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.error('Cho phép app truy cập ảnh trong Cài đặt để gửi ảnh.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: room > 1,
      selectionLimit: room,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: imagePickerQuality(0.8),
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    for (const asset of result.assets.slice(0, room)) {
      setImages((cur) => [...cur, { localUri: asset.uri, publicUrl: null }]);
      try {
        const prepared = await prepareAttachment(pickedImage(asset));
        if (prepared.contentType !== 'image/jpeg' && prepared.contentType !== 'image/png') {
          throw new Error('Chỉ gửi được ảnh JPG / PNG.');
        }
        const { uploadUrl, publicUrl } = await presignConversationImage(prepared.name, prepared.contentType);
        await putFileToPresignedUrl(uploadUrl, prepared.uri, prepared.contentType);
        setImages((cur) => cur.map((i) => (i.localUri === asset.uri ? { ...i, publicUrl } : i)));
      } catch (err) {
        setImages((cur) => cur.filter((i) => i.localUri !== asset.uri));
        toast.error(extractApiError(err), 'Không tải được ảnh');
      }
    }
  }

  function pickQuickReply(r: QuickReply) {
    setQuickOpen(false);
    setDraft((cur) => applyQuickReplyText(cur, r).slice(0, MESSAGE_MAX_LENGTH));
    if (r.imageUrls.length > 0 && !privateMode) {
      setImages((cur) =>
        [...cur, ...r.imageUrls.map((u) => ({ localUri: u, publicUrl: u }))].slice(0, maxImages)
      );
    }
  }

  function applySuggestion(text: string) {
    setNoteMode(false);
    setReplyMode('public');
    setDraft(text.slice(0, MESSAGE_MAX_LENGTH));
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  // ── Gửi.
  async function send(retried = false): Promise<void> {
    const text = draft.trim();
    if (!canSend && !retried) return;
    setSending(true);
    try {
      const msg = privateMode
        ? await privateReply(conv.id, text)
        : await sendConversationMessage(conv.id, {
            text: text || undefined,
            imageUrls: images.length ? images.map((i) => i.publicUrl!).filter(Boolean) : undefined,
            internalNote: noteMode || undefined,
          });
      haptics.light();
      applyMessage(qc, msg, 'add');
      setDraft('');
      setImages([]);
      if (msg.status === 'failed') toast.error(msg.error || 'Facebook từ chối tin này.', 'Gửi lỗi');
      if (!noteMode) qc.invalidateQueries({ queryKey: detailKey(conv.id) });
    } catch (err) {
      const kind = inboxErrorKind(err);
      if (kind === 'held-by-other' && perms.manage && !retried) {
        const ok = await confirm({
          title: 'Người khác đang trả lời',
          message: `${extractApiError(err)}\nGiành quyền và gửi tin này?`,
          confirmText: 'Giành quyền & gửi',
          destructive: true,
        });
        if (ok) {
          try {
            applyConversation(qc, await takeConversation(conv.id, true), myUserId);
            setSending(false);
            await send(true);
            return;
          } catch (e2) {
            toast.error(extractApiError(e2));
          }
        }
      } else if (kind === 'window-closed') {
        toast.error('Đã quá 24 giờ từ tin cuối của khách — Meta không cho gửi tin thường.');
        detailQuery.refetch();
      } else if (kind === 'not-supported') {
        toast.error(NOT_SUPPORTED_MESSAGE);
      } else if (kind === 'private-reply-failed') {
        toast.error(extractApiError(err), 'Không nhắn riêng được');
      } else {
        toast.error(extractApiError(err));
        if (kind === 'held-by-other') detailQuery.refetch();
      }
    } finally {
      setSending(false);
    }
  }

  const actions = holderActions(conv.holder, myUserId, perms);
  const tone = holderTone(conv.holder, myUserId);
  const subtitle = [conv.channelName, isComment ? 'Bình luận' : 'Tin nhắn', conv.status !== 'open' ? (conv.status === 'spam' ? 'Spam' : 'Đã hoàn tất') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      {/* Đầu trang */}
      <View className="px-3 pt-2 pb-1 flex-row items-center gap-2">
        <Pressable onPress={() => router.back()} className="w-9 h-9 items-center justify-center rounded-full" accessibilityLabel="Quay lại">
          <Icon name="chevron-left" size={26} tone="default" />
        </Pressable>
        <Pressable onPress={() => setCustomerOpen(true)} className="flex-1 flex-row items-center gap-2 min-w-0" accessibilityRole="button">
          <InboxAvatar conv={conv} size={40} />
          <View className="flex-1 min-w-0">
            <View className="flex-row items-center gap-1">
              <Text variant="subtitle" numberOfLines={1} className="flex-shrink">{conv.customer.name}</Text>
              {isPriority(conv) ? <Icon name="star" size={16} tone="warning" /> : null}
            </View>
            <Text variant="caption" tone="muted" numberOfLines={1}>{subtitle}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setCustomerOpen(true)} className="w-9 h-9 items-center justify-center rounded-full" accessibilityLabel="Thông tin khách">
          <Icon name="account-details-outline" size={22} tone="muted" />
        </Pressable>
        <Pressable onPress={openMenu} className="w-9 h-9 items-center justify-center rounded-full" accessibilityLabel="Thêm thao tác">
          <Icon name="dots-vertical" size={22} tone="muted" />
        </Pressable>
      </View>

      {/* Thanh người giữ */}
      <View className="px-4 py-2 flex-row items-center gap-2 flex-wrap border-b border-line dark:border-line-dark">
        <Badge tone={tone} icon={conv.holder.type === 'agent' ? 'robot-outline' : conv.holder.type === 'external' ? 'facebook' : conv.holder.type === 'user' ? 'account-outline' : 'inbox-arrow-down-outline'}>
          {holderLabel(conv.holder, myUserId)}
        </Badge>
        {conv.assignedName ? (
          <Text variant="caption" tone="muted">Giao: {conv.assignedName}</Text>
        ) : null}
        <View className="flex-1" />
        {actions.map((a) => (
          <Button
            key={a}
            size="sm"
            variant={a === 'take' ? 'solid' : 'soft'}
            action={a === 'force-take' ? 'error' : 'primary'}
            icon={ACTION_LABEL[a].icon}
            fullWidth={false}
            loading={busy === a}
            disabled={!!busy && busy !== a}
            onPress={() => runHolder(a)}
          >
            {ACTION_LABEL[a].label}
          </Button>
        ))}
      </View>

      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {messagesQuery.isLoading ? (
          <Loading />
        ) : messagesQuery.isError ? (
          <ErrorView message="Không tải được tin nhắn." onRetry={() => messagesQuery.refetch()} />
        ) : (
          <FlatList
            data={reversed}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerClassName="py-2"
            keyboardShouldPersistTaps="handled"
            onEndReached={() => {
              if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) messagesQuery.fetchNextPage();
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={messagesQuery.isFetchingNextPage ? <View className="py-2"><Spinner /></View> : null}
            ListEmptyComponent={
              <View className="items-center py-10" style={{ transform: [{ scaleY: -1 }] }}>
                <Text variant="bodySmall" tone="muted">Chưa có tin nhắn.</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const older = reversed[index + 1];
              const showDate = !older || !dayjs(older.sentAt).isSame(item.sentAt, 'day');
              return (
                <>
                  {showDate && item.sentAt ? <DayChip iso={item.sentAt} /> : null}
                  <MessageBubble
                    m={item}
                    kind={conv.kind}
                    canReply={perms.reply}
                    onUseSuggestion={applySuggestion}
                    onToggleHidden={toggleHidden}
                    onOpenImage={openImage}
                  />
                </>
              );
            }}
          />
        )}

        {/* Ô gõ */}
        {perms.reply ? (
          <View
            className={cn(
              'border-t border-line dark:border-line-dark px-3 pt-2 gap-2',
              noteMode ? 'bg-warning-soft' : 'bg-surface dark:bg-surface-dark'
            )}
            style={{ paddingBottom: kbUp ? 8 : Math.max(insets.bottom, 8) }}
          >
            {!conv.canReply && conv.reason ? (
              <View className="flex-row items-start gap-2 rounded-xl bg-error-soft px-3 py-2">
                <Icon name="alert-circle-outline" size={16} tone="error" />
                <Text variant="caption" tone="error" className="flex-1">
                  {conv.reason} {noteMode ? '' : 'Vẫn ghi chú nội bộ được.'}
                </Text>
              </View>
            ) : warning ? (
              <View className="flex-row items-start gap-2 rounded-xl bg-warning-soft px-3 py-2">
                <Icon name="clock-alert-outline" size={16} tone="warning" />
                <Text variant="caption" className="flex-1">{warning}</Text>
              </View>
            ) : null}

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2" keyboardShouldPersistTaps="handled">
              {isComment ? (
                <>
                  <Chip
                    label="Trả lời công khai"
                    icon="comment-outline"
                    size="sm"
                    color="info"
                    selected={!noteMode && replyMode === 'public'}
                    onPress={() => {
                      setNoteMode(false);
                      setReplyMode('public');
                    }}
                  />
                  <Chip
                    label="Nhắn riêng"
                    icon="facebook-messenger"
                    size="sm"
                    color="info"
                    selected={!noteMode && replyMode === 'private'}
                    onPress={() => {
                      setNoteMode(false);
                      setReplyMode('private');
                      setImages([]);
                    }}
                  />
                </>
              ) : null}
              <Chip
                label="Ghi chú nội bộ"
                icon="note-text-outline"
                size="sm"
                color="warning"
                selected={noteMode}
                onPress={() => setNoteMode((v) => !v)}
              />
            </ScrollView>

            {images.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                {images.map((img) => (
                  <View key={img.localUri} style={{ width: 64, height: 64 }}>
                    <Image source={{ uri: img.localUri }} style={{ width: 64, height: 64, borderRadius: 10, opacity: img.publicUrl ? 1 : 0.5 }} />
                    {!img.publicUrl ? (
                      <View className="absolute inset-0 items-center justify-center"><Spinner /></View>
                    ) : (
                      <Pressable
                        onPress={() => setImages((cur) => cur.filter((i) => i.localUri !== img.localUri))}
                        className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-ink items-center justify-center"
                        accessibilityLabel="Bỏ ảnh"
                      >
                        <Icon name="close" size={14} color="#FFFFFF" />
                      </Pressable>
                    )}
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <View className="flex-row items-end gap-1">
              {!privateMode ? (
                <Pressable onPress={pickImages} disabled={sending || realSendBlocked} className="w-10 h-10 items-center justify-center rounded-full" accessibilityLabel="Gửi ảnh">
                  <Icon name="image-plus" size={24} tone={sending || realSendBlocked ? 'faint' : 'muted'} />
                </Pressable>
              ) : null}
              <Pressable onPress={() => setQuickOpen(true)} disabled={realSendBlocked} className="w-10 h-10 items-center justify-center rounded-full" accessibilityLabel="Mẫu trả lời nhanh">
                <Icon name="lightning-bolt-outline" size={24} tone={realSendBlocked ? 'faint' : 'muted'} />
              </Pressable>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
                editable={!realSendBlocked}
                placeholder={
                  noteMode
                    ? 'Ghi chú nội bộ — khách không thấy'
                    : realSendBlocked
                      ? 'Không gửi được tin cho khách'
                      : privateMode
                        ? 'Nhắn riêng qua Messenger…'
                        : isComment
                          ? 'Trả lời công khai bình luận…'
                          : 'Nhập tin nhắn…'
                }
                placeholderTextColor={brand.faint}
                multiline
                maxLength={MESSAGE_MAX_LENGTH}
                className="flex-1 rounded-3xl px-4 py-2.5 text-[15px] text-ink dark:text-ink-dark bg-bg dark:bg-bg-dark max-h-32"
              />
              <Pressable
                onPress={() => send()}
                disabled={!canSend}
                className="w-10 h-10 items-center justify-center rounded-full"
                accessibilityLabel={noteMode ? 'Lưu ghi chú' : 'Gửi'}
              >
                {sending ? <Spinner /> : <Icon name={noteMode ? 'note-plus-outline' : 'send'} size={24} tone={canSend ? 'primary' : 'faint'} />}
              </Pressable>
            </View>
          </View>
        ) : (
          <View className="border-t border-line dark:border-line-dark px-4 pt-3" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
            <Text variant="caption" tone="muted" className="text-center">Bạn chỉ có quyền xem hộp thư khách.</Text>
          </View>
        )}
      </KeyboardAvoidingView>

      <CustomerSheet
        visible={customerOpen}
        onClose={() => setCustomerOpen(false)}
        detail={conv}
        canEdit={perms.reply}
        myUserId={myUserId}
      />
      <QuickReplySheet visible={quickOpen} onClose={() => setQuickOpen(false)} onPick={pickQuickReply} />
      {viewer.open ? (
        <ImageViewer images={gallery} initialIndex={viewer.index} visible onClose={() => setViewer({ open: false, index: 0 })} />
      ) : null}
    </View>
  );
}
