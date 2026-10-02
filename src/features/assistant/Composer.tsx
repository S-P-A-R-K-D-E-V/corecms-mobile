import { useState } from 'react';
import { Image, ScrollView, TextInput, View } from 'react-native';

import { Text, Pressable, Icon, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { useT } from 'src/i18n';
import { useImageAttachments, type ImageAttachmentItem } from './use-image-attachments';
import type { ImageRules } from './image-attachments';
import type { SendResult } from './use-assistant-chat';

// ----------------------------------------------------------------------
// Ô soạn câu hỏi trợ lý: chữ + ảnh đính kèm (chỉ khi server báo imageInput). Ảnh PUT thẳng lên R2 ngay khi
// chọn; câu hỏi chỉ gửi objectKey. Nút gửi khoá khi ảnh đang tải lên, hoặc không có chữ lẫn ảnh sẵn sàng.
// ----------------------------------------------------------------------

function Thumb({
  item,
  onRetry,
  onRemove,
}: {
  item: ImageAttachmentItem;
  onRetry: (i: ImageAttachmentItem) => void;
  onRemove: (i: ImageAttachmentItem) => void;
}) {
  const t = useT();
  return (
    <View className="w-16 h-16">
      <Pressable
        disabled={item.status !== 'error'}
        onPress={() => onRetry(item)}
        accessibilityLabel={item.status === 'error' ? t('assistant.uploadFailed') : item.fileName}
        className="w-16 h-16 rounded-xl overflow-hidden bg-bg dark:bg-bg-dark"
      >
        <Image source={{ uri: item.localUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        {item.status !== 'ready' ? (
          <View className="absolute inset-0 items-center justify-center bg-black/40">
            {item.status === 'uploading' ? (
              <Spinner color="#FFFFFF" />
            ) : (
              <Icon name="refresh" size={22} tone="inverse" />
            )}
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={() => onRemove(item)}
        hitSlop={8}
        accessibilityLabel={t('assistant.removeImage')}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full items-center justify-center bg-ink dark:bg-surface-dark border border-white"
      >
        <Icon name="close" size={12} tone="inverse" />
      </Pressable>
    </View>
  );
}

export function Composer({
  sessionId,
  sending,
  placeholder,
  imageInput,
  rules,
  bottomPadding,
  onSend,
}: {
  sessionId: string | null;
  sending: boolean;
  placeholder: string;
  /** Server cho gửi ảnh (capabilities.imageInput) — server cũ / tắt → không có nút đính kèm. */
  imageInput: boolean;
  rules: ImageRules;
  bottomPadding: number;
  onSend: (content: string, attachments: { objectKey: string }[], localUris: string[]) => Promise<SendResult>;
}) {
  const t = useT();
  const [text, setText] = useState('');
  const images = useImageAttachments(sessionId, rules);

  const hasText = !!text.trim();
  const canSend = !!sessionId && !sending && !images.uploading && (hasText || images.ready.length > 0);

  async function submit() {
    if (!canSend) return;
    const content = text.trim();
    const ready = images.ready;
    setText('');
    const result = await onSend(
      content,
      ready.map((i) => ({ objectKey: i.objectKey! })),
      ready.map((i) => i.localUri)
    );
    if (result === 'sent') {
      images.clear();
      return;
    }
    // Gửi không được: trả chữ lại; server đã từ chối (và xoá) ảnh thì bỏ ảnh, lỗi mạng thì giữ để gửi lại.
    setText((cur) => cur || content);
    if (result === 'attachments_rejected') images.clear();
  }

  return (
    <View className="border-t border-line dark:border-line-dark bg-surface dark:bg-surface-dark" style={{ paddingBottom: bottomPadding }}>
      {images.items.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2.5 px-3 pt-3 pb-1">
          {images.items.map((item) => (
            <Thumb key={item.id} item={item} onRetry={images.retry} onRemove={images.remove} />
          ))}
          {images.uploading ? (
            <View className="justify-center pl-1">
              <Text variant="caption" tone="muted">{t('assistant.uploading')}</Text>
            </View>
          ) : null}
        </ScrollView>
      ) : null}
      <View className="flex-row items-end gap-1 p-2 px-3">
        {imageInput ? (
          <Pressable
            onPress={images.pick}
            disabled={!sessionId || sending}
            accessibilityLabel={t('assistant.attachImage')}
            className={cn('w-10 h-11 items-center justify-center rounded-full', (!sessionId || !images.canAddMore) && 'opacity-50')}
          >
            <Icon name="image-plus" size={24} tone="muted" />
          </Pressable>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={brand.faint}
          multiline
          maxLength={1000}
          editable={!!sessionId}
          className="flex-1 rounded-3xl px-4 py-2.5 text-[15px] text-ink dark:text-ink-dark bg-bg dark:bg-bg-dark max-h-32"
        />
        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityLabel="Send"
          className="w-11 h-11 items-center justify-center rounded-full"
        >
          {sending ? <Spinner /> : <Icon name="send" size={24} tone={canSend ? 'primary' : 'faint'} />}
        </Pressable>
      </View>
    </View>
  );
}
