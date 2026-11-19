import { Image, View } from 'react-native';
import dayjs from 'dayjs';

import { Badge, Button, Icon, Pressable, Text } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { openInAppBrowser } from 'src/features/assistant/links';
import type { ConversationKind, ConversationMessage } from 'src/api/inbox';

import { bubbleKind, canToggleCommentHidden, outgoingSenderCaption, senderLabel } from './inbox-format';

// ----------------------------------------------------------------------
// Một tin trong hội thoại: tin đi (nhân viên / page / agent) xanh bên phải kèm "Người gửi: …"; tin khách xám bên trái; ghi
// chú nội bộ vàng; gợi ý của agent viền xanh + "Dùng gợi ý"; bình luận đã ẩn mờ + "Đã ẩn" (+ Ẩn / Hiện ở hội thoại bình luận).
// ----------------------------------------------------------------------

export const OUTGOING_BLUE = '#0A7CFF';

function Attachments({
  m,
  light,
  onOpenImage,
}: {
  m: ConversationMessage;
  light: boolean;
  onOpenImage: (url: string) => void;
}) {
  if (m.attachments.length === 0) return null;
  return (
    <View className="gap-1 mt-1">
      {m.attachments.map((a, i) =>
        a.type === 'image' ? (
          <Pressable key={a.url + i} onPress={() => onOpenImage(a.url)} accessibilityLabel="Xem ảnh">
            <Image source={{ uri: a.url }} style={{ width: 200, height: 200, borderRadius: 12 }} resizeMode="cover" />
          </Pressable>
        ) : (
          <Pressable
            key={a.url + i}
            onPress={() => openInAppBrowser(a.url)}
            className={cn('flex-row items-center gap-2 px-3 py-2 rounded-xl', light ? 'bg-white/15' : 'bg-surface dark:bg-surface-dark')}
          >
            <Icon
              name={a.type === 'video' ? 'video-outline' : a.type === 'audio' ? 'microphone-outline' : a.type === 'link' ? 'link-variant' : 'file-outline'}
              size={20}
              color={light ? '#FFFFFF' : undefined}
              tone={light ? undefined : 'primary'}
            />
            <Text variant="bodySmall" className={cn('flex-1', light && 'text-white')} numberOfLines={1}>
              {a.name || (a.type === 'link' ? a.url : 'Tệp đính kèm')}
            </Text>
          </Pressable>
        )
      )}
    </View>
  );
}

export function MessageBubble({
  m,
  kind,
  canReply,
  onUseSuggestion,
  onToggleHidden,
  onOpenImage,
}: {
  m: ConversationMessage;
  kind: ConversationKind;
  canReply: boolean;
  onUseSuggestion: (text: string) => void;
  onToggleHidden: (m: ConversationMessage) => void;
  onOpenImage: (url: string) => void;
}) {
  const type = bubbleKind(m);
  const time = m.sentAt ? dayjs(m.sentAt).format('HH:mm') : '';

  if (type === 'system') {
    return (
      <View className="items-center my-1.5 px-6">
        <Text variant="caption" tone="muted" className="text-center">
          {m.text || senderLabel(m)} · {time}
        </Text>
      </View>
    );
  }

  if (type === 'note' || type === 'suggestion') {
    const suggestion = type === 'suggestion';
    return (
      <View
        className={cn(
          'my-1 mx-2 rounded-2xl px-3.5 py-2.5 gap-1',
          suggestion ? 'border border-info/60 bg-info/5' : 'bg-warning-soft border border-warning/30'
        )}
      >
        <View className="flex-row items-center gap-1.5">
          <Icon name={suggestion ? 'robot-outline' : 'note-text-outline'} size={14} tone={suggestion ? 'info' : 'warning'} />
          <Text variant="caption" className="font-semibold flex-1" numberOfLines={1}>
            {suggestion ? 'Gợi ý của agent — khách chưa thấy' : `Ghi chú nội bộ · ${senderLabel(m)}`}
          </Text>
          <Text variant="caption" tone="faint">{time}</Text>
        </View>
        {m.text ? <Text variant="callout" selectable>{m.text}</Text> : null}
        <Attachments m={m} light={false} onOpenImage={onOpenImage} />
        {suggestion && canReply && m.text ? (
          <View className="flex-row mt-1">
            <Button size="sm" variant="soft" icon="pencil-outline" fullWidth={false} onPress={() => onUseSuggestion(m.text!)}>
              Dùng gợi ý
            </Button>
          </View>
        ) : null}
      </View>
    );
  }

  const out = type === 'out';
  const hidden = m.status === 'hidden';
  const failed = m.status === 'failed';
  const toggle = canReply && canToggleCommentHidden(m, kind);

  return (
    <View className={cn('my-0.5 px-2', out ? 'items-end' : 'items-start')}>
      <View
        className={cn('max-w-[80%] px-3.5 py-2.5 rounded-2xl', !out && 'bg-ink/5 dark:bg-white/10', hidden && 'opacity-50')}
        style={out ? { backgroundColor: failed ? '#9AA5B1' : OUTGOING_BLUE } : undefined}
      >
        {m.text ? (
          <Text variant="callout" className={out ? 'text-white' : ''} selectable>
            {m.text}
          </Text>
        ) : null}
        <Attachments m={m} light={out} onOpenImage={onOpenImage} />
      </View>
      <View className={cn('flex-row items-center gap-1.5 mt-0.5 px-1', out && 'justify-end')}>
        {hidden ? <Badge tone="neutral" icon="eye-off-outline">Đã ẩn</Badge> : null}
        <Text variant="micro" tone="faint">
          {out ? `${outgoingSenderCaption(m)} · ${time}` : time}
          {m.status === 'sending' ? ' · Đang gửi…' : ''}
        </Text>
        {toggle ? (
          <Pressable onPress={() => onToggleHidden(m)} hitSlop={8} accessibilityRole="button">
            <Text variant="micro" tone="primary" className="font-semibold">
              {hidden ? 'Hiện' : 'Ẩn'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {failed ? (
        <Text variant="caption" tone="error" className="px-1">
          Gửi lỗi{m.error ? `: ${m.error}` : ''}
        </Text>
      ) : null}
    </View>
  );
}
