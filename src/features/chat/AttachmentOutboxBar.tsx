import { View, ScrollView, Image } from 'react-native';

import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { brand } from 'src/theme';
import { t } from 'src/i18n';
import { batchProgress, extensionOf } from './attachment-rules';
import type { Outbox, OutboxItem } from './useAttachmentOutbox';

// ----------------------------------------------------------------------
// Khay "đang gửi" trên ô nhập: xem trước ảnh/tệp (uri trên máy), thanh tiến độ từng tệp, lỗi + Thử lại / Huỷ.
// Tin thật (ảnh lấy từ /media) hiện trong danh sách khi gửi xong.
// ----------------------------------------------------------------------

const THUMB = 56;

function Thumb({ item }: { item: OutboxItem }) {
  const uploaded = !!item.objectKey;
  return (
    <View style={{ width: THUMB, height: THUMB }} className="rounded-xl overflow-hidden bg-bg dark:bg-bg-dark border border-line/60 dark:border-line-dark">
      {item.kind === 'image' ? (
        <Image source={{ uri: item.uri }} style={{ width: THUMB, height: THUMB }} resizeMode="cover" />
      ) : (
        <View className="flex-1 items-center justify-center gap-0.5 px-1">
          <Icon name="file-document-outline" size={22} tone="primary" />
          <Text variant="nano" tone="muted" numberOfLines={1} className="uppercase font-bold">
            {extensionOf(item.name) ?? ''}
          </Text>
        </View>
      )}
      {item.failed ? (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <Icon name="alert-circle" size={22} color="#FFFFFF" />
        </View>
      ) : uploaded ? (
        <View className="absolute top-1 right-1 w-4 h-4 rounded-full bg-success items-center justify-center">
          <Icon name="check" size={12} color="#FFFFFF" />
        </View>
      ) : null}
      {!uploaded && !item.failed ? (
        <View className="absolute left-0 right-0 bottom-0 h-1 bg-black/20">
          <View style={{ width: `${Math.round(item.progress * 100)}%`, height: '100%', backgroundColor: brand.primary }} />
        </View>
      ) : null}
    </View>
  );
}

export function AttachmentOutboxBar({ outbox, onRetry, onDiscard }: { outbox: Outbox | null; onRetry: () => void; onDiscard: () => void }) {
  if (!outbox) return null;
  const isError = outbox.phase === 'error';
  const prog = batchProgress(outbox.items.map((i) => ({ size: i.size, progress: i.progress, uploaded: !!i.objectKey })));
  const status =
    outbox.phase === 'preparing'
      ? t('chat.attach.preparing', { n: outbox.count })
      : outbox.phase === 'uploading'
        ? t('chat.attach.uploading', { done: prog.done, total: prog.total, percent: prog.percent })
        : outbox.phase === 'sending'
          ? t('chat.attach.sending')
          : outbox.error ?? t('chat.attach.failed');

  return (
    <View className="px-3 pt-2 pb-1.5 gap-2 border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark">
      {outbox.items.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {outbox.items.map((item) => (
            <Thumb key={item.id} item={item} />
          ))}
        </ScrollView>
      ) : null}
      <View className="flex-row items-center gap-2">
        {isError ? <Icon name="alert-circle-outline" size={18} tone="error" /> : <Spinner />}
        <Text variant="caption" tone={isError ? 'error' : 'muted'} className="flex-1" numberOfLines={3}>
          {status}
        </Text>
        {isError ? (
          <>
            <Pressable onPress={onDiscard} hitSlop={6} className="px-2.5 py-1.5 rounded-full">
              <Text variant="bodySmall" tone="muted" className="font-semibold">{t('chat.attach.discard')}</Text>
            </Pressable>
            {outbox.canRetry ? (
              <Pressable onPress={onRetry} hitSlop={6} className="px-3 py-1.5 rounded-full bg-primary">
                <Text variant="bodySmall" className="text-white font-semibold">{t('common.retry')}</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}
