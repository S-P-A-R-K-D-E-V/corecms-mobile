import { useState } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';

import { Text, Pressable, Icon } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { confirm } from 'src/components/overlay';
import { getStorageUrl } from 'src/api/axios';
import { ImageViewer } from 'src/features/chat/ImageViewer';
import { openInAppBrowser } from './links';
import type { UiBlock, UiImageBlock, UiLinkBlock, UiNavigateAction, UiSuggestion, UiSuggestionsBlock, UiToolAction } from './blocks';

// ----------------------------------------------------------------------
// Phần có cấu trúc dưới câu trả lời (đã qua normalizeBlocks): lưới ảnh (chạm để phóng to), thẻ link
// (mở trong app), nút mở màn / nút thao tác (hỏi lại rồi gửi câu lệnh như tin nhắn), chip gợi ý.
// ----------------------------------------------------------------------

export function imageUri(block: UiImageBlock): string {
  return block.url ?? getStorageUrl(block.objectKey);
}

/** Lưới ảnh dùng chung (ảnh trả lời / ảnh người dùng gửi): 1 ảnh rộng 16:10, 2–6 ảnh ô vuông 2 cột. */
export function ImageGrid({ uris, alts }: { uris: string[]; alts?: (string | undefined)[] }) {
  const [failed, setFailed] = useState<Set<number>>(new Set());
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const visible = uris.map((uri, i) => ({ uri, i, alt: alts?.[i] })).filter((x) => !failed.has(x.i));
  if (visible.length === 0) return null;
  const single = visible.length === 1;

  return (
    <View className="flex-row flex-wrap gap-1.5">
      {visible.map((img, pos) => (
        <Pressable
          key={`${img.i}-${img.uri}`}
          onPress={() => setViewerIndex(pos)}
          accessibilityRole="imagebutton"
          accessibilityLabel={img.alt}
          style={single ? { width: '100%', aspectRatio: 16 / 10 } : { width: '48.5%', aspectRatio: 1 }}
          className="rounded-xl overflow-hidden bg-bg dark:bg-bg-dark"
        >
          <Image
            source={{ uri: img.uri }}
            resizeMode="cover"
            style={{ width: '100%', height: '100%' }}
            // Ảnh hỏng / hết hạn → ẩn ô, không để khung trống.
            onError={() => setFailed((prev) => new Set(prev).add(img.i))}
          />
        </Pressable>
      ))}
      {viewerIndex !== null ? (
        <ImageViewer
          images={visible.map((v) => ({ uri: v.uri }))}
          initialIndex={Math.min(viewerIndex, visible.length - 1)}
          visible
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </View>
  );
}

function LinkCard({ block }: { block: UiLinkBlock }) {
  return (
    <Pressable
      onPress={() => openInAppBrowser(block.url)}
      accessibilityRole="link"
      className="flex-row items-center gap-2.5 px-3 py-2.5 rounded-xl bg-bg dark:bg-bg-dark border border-line dark:border-line-dark"
    >
      <View className="w-8 h-8 rounded-lg items-center justify-center bg-primary-soft">
        <Icon name="link-variant" size={18} tone="primary" />
      </View>
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{block.title}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>{block.host}</Text>
      </View>
      <Icon name="open-in-new" size={16} tone="muted" />
    </Pressable>
  );
}

function ActionButtons({
  actions,
  busy,
  onSend,
}: {
  actions: (UiNavigateAction | UiToolAction)[];
  busy: boolean;
  onSend: (prompt: string) => void;
}) {
  async function press(a: UiNavigateAction | UiToolAction) {
    if (a.kind === 'navigate') {
      router.push(a.href as never);
      return;
    }
    // Không tự chạy gì: hỏi lại, đồng ý thì gửi câu lệnh như tin nhắn — trợ lý tự gọi công cụ qua
    // kiểm quyền + bước "xác nhận" sẵn có phía server.
    if (await confirm({ title: a.confirm.title, message: a.confirm.message })) onSend(a.prompt);
  }

  return (
    <View className="flex-row flex-wrap gap-2">
      {actions.map((a) => {
        // Đang có câu trả lời chạy → tạm khoá, tránh chồng lệnh.
        const disabled = busy;
        return (
          <Pressable
            key={a.id}
            disabled={disabled}
            onPress={() => press(a)}
            className={cn(
              'flex-row items-center gap-1.5 px-3 py-2 rounded-xl border border-primary/30 bg-primary-soft',
              disabled && 'opacity-50'
            )}
          >
            <Icon name={a.kind === 'navigate' ? 'arrow-right-circle-outline' : 'gesture-tap'} size={16} tone="primary" />
            <Text variant="bodySmall" tone="primary" className="font-semibold" numberOfLines={1}>{a.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Chip gợi ý câu hỏi tiếp theo — chỉ dưới câu trả lời CUỐI và khi đã trả lời xong. */
export function SuggestionChips({ items, disabled, onSend }: { items: UiSuggestion[]; disabled?: boolean; onSend: (prompt: string) => void }) {
  if (items.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2 mt-1.5">
      {items.map((s) => (
        <Pressable
          key={s.label}
          disabled={disabled}
          onPress={() => onSend(s.prompt)}
          className={cn('px-3 py-1.5 rounded-full bg-primary-soft border border-primary/20', disabled && 'opacity-50')}
        >
          <Text variant="bodySmall" tone="primary" className="font-semibold">{s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Ảnh + link + nút trong bong bóng trả lời (gợi ý hiển thị riêng bên ngoài, xem SuggestionChips). */
export function MessageBlocks({ blocks, busy, onSend }: { blocks: UiBlock[]; busy: boolean; onSend: (prompt: string) => void }) {
  const images = blocks.filter((b): b is UiImageBlock => b.type === 'image');
  const links = blocks.filter((b): b is UiLinkBlock => b.type === 'link');
  const actions = blocks.filter((b): b is UiNavigateAction | UiToolAction => b.type === 'action');
  if (!images.length && !links.length && !actions.length) return null;
  return (
    <View className="gap-2 mt-2">
      {images.length ? <ImageGrid uris={images.map(imageUri)} alts={images.map((b) => b.alt)} /> : null}
      {links.map((l) => (
        <LinkCard key={l.url} block={l} />
      ))}
      {actions.length ? <ActionButtons actions={actions} busy={busy} onSend={onSend} /> : null}
    </View>
  );
}

export function suggestionsOf(blocks: UiBlock[]): UiSuggestion[] {
  return blocks.find((b): b is UiSuggestionsBlock => b.type === 'suggestions')?.items ?? [];
}
