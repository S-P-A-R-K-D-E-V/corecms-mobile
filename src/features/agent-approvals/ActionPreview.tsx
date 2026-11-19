import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';

import { Avatar, Badge, Chip, Divider, Icon, Pressable, Text } from 'src/components/ui';
import { ImageViewer } from 'src/features/chat/ImageViewer';
import { formatMoney } from 'src/i18n/format';
import type {
  AgentActionView,
  AgentPreviewField,
  AgentPreviewProduct,
  AgentSocialBatchItem,
  AgentSocialPostPreview,
} from 'src/api/agent-actions';

import { actionParams, channelHandle, socialBatchOf, socialPostOf } from './agent-action-format';

// ----------------------------------------------------------------------
// Bản xem trước của phiếu agent: bài mạng xã hội trông như bài Threads thật (kênh, giờ đăng, caption, ảnh trượt ngang —
// chạm để phóng to, sản phẩm gắn) hoặc bảng "nhãn — giá trị" cho lệnh khác.
// ----------------------------------------------------------------------

const IMAGE_W = 200;
const IMAGE_H = 250;
const IMAGE_GAP = 8;

/** Ảnh trượt ngang; chạm → xem toàn màn hình (vuốt qua lại, phóng to). `marked` = ảnh gắn nhãn "Cần làm lại". */
export function ImageStrip({
  urls,
  width = IMAGE_W,
  height = IMAGE_H,
  marked,
}: {
  urls: string[];
  width?: number;
  height?: number;
  marked?: readonly string[];
}) {
  const [viewer, setViewer] = useState<number | null>(null);
  if (urls.length === 0) return null;
  const images = urls.map((uri) => ({ uri }));

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={width + IMAGE_GAP}
        decelerationRate="fast"
        contentContainerStyle={{ gap: IMAGE_GAP }}
      >
        {urls.map((uri, i) => (
          <Pressable
            key={`${uri}-${i}`}
            onPress={() => setViewer(i)}
            accessibilityRole="imagebutton"
            accessibilityLabel={`Ảnh ${i + 1} / ${urls.length} — chạm để phóng to`}
          >
            <Image
              source={{ uri }}
              style={{ width, height, borderRadius: 12 }}
              className="bg-ink/5 dark:bg-white/5"
              resizeMode="cover"
            />
            {marked?.includes(uri) ? (
              <View className="absolute left-2 top-2">
                <Badge tone="warning" variant="filled" icon="refresh">Cần làm lại</Badge>
              </View>
            ) : null}
            {urls.length > 1 ? (
              <View className="absolute right-2 bottom-2 rounded-full px-2 py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                <Text className="text-white text-[11px] font-semibold">{i + 1}/{urls.length}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
      {viewer !== null ? (
        <ImageViewer images={images} initialIndex={Math.min(viewer, images.length - 1)} visible onClose={() => setViewer(null)} />
      ) : null}
    </>
  );
}

function ProductRow({ product }: { product: AgentPreviewProduct }) {
  return (
    <View className="flex-row items-center gap-2.5 py-2">
      {product.imageUrl ? (
        <Image source={{ uri: product.imageUrl }} style={{ width: 40, height: 40, borderRadius: 8 }} className="bg-ink/5 dark:bg-white/5" />
      ) : (
        <View className="w-10 h-10 rounded-lg items-center justify-center bg-ink/5 dark:bg-white/5">
          <Icon name="tag-outline" size={18} tone="muted" />
        </View>
      )}
      <View className="flex-1 min-w-0">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{product.name}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {product.code ? `${product.code} · ` : ''}
          {formatMoney(product.price)}
        </Text>
      </View>
      {!product.inStock ? <Badge tone="error">Hết hàng</Badge> : null}
    </View>
  );
}

/** Bài mạng xã hội agent định đăng, trình bày như một bài Threads. */
export function SocialPostPreview({ post }: { post: AgentSocialPostPreview }) {
  const [first, ...others] = post.channels;
  const text = post.text?.trim();

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <Avatar name={first?.name ?? 'Kênh'} uri={first?.avatarUrl} size={40} />
        <View className="flex-1 min-w-0 gap-1.5">
          <View>
            <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>
              {first ? first.name : 'Chưa chọn kênh đăng'}
            </Text>
            {first && channelHandle(first) ? (
              <Text variant="caption" tone="muted" numberOfLines={1}>{channelHandle(first)}</Text>
            ) : null}
            {others.length > 0 ? (
              <Text variant="caption" tone="muted" numberOfLines={2}>
                Cùng đăng lên: {others.map((c) => c.name).join(', ')}
              </Text>
            ) : null}
          </View>
          {post.modeLabel ? (
            <Chip
              size="sm"
              color={post.mode === 'now' ? 'warning' : post.mode === 'draft' ? 'default' : 'info'}
              icon={post.mode === 'now' ? 'send-outline' : post.mode === 'draft' ? 'file-document-edit-outline' : 'clock-outline'}
              label={post.modeLabel}
            />
          ) : null}
          {text ? (
            <Text variant="body" selectable>{text}</Text>
          ) : (
            <Text variant="bodySmall" tone="muted">(Bài không có chữ)</Text>
          )}
        </View>
      </View>

      {post.imageUrls.length > 0 ? <ImageStrip urls={post.imageUrls} /> : null}

      {post.products.length > 0 ? (
        <View>
          <Text variant="caption" tone="muted">Sản phẩm gắn kèm ({post.products.length})</Text>
          {post.products.map((p, i) => (
            <View key={p.id || `${p.code}-${i}`}>
              {i > 0 ? <Divider /> : null}
              <ProductRow product={p} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Lịch đăng bài: từng bài theo giờ, bài đã sửa / không còn được đánh dấu. */
export function SocialBatchPreview({ items }: { items: AgentSocialBatchItem[] }) {
  return (
    <View className="gap-3">
      <Text variant="bodySmall" tone="muted">
        {items.length} bài — duyệt một lần là cả lịch tự đăng đúng giờ.
      </Text>
      {items.map((item, i) => (
        <View key={item.postId} className="gap-2" style={item.missing ? { opacity: 0.6 } : undefined}>
          {i > 0 ? <Divider /> : null}
          <View className="flex-row flex-wrap items-center gap-2">
            <Text variant="bodySmall" className="font-semibold">Bài {i + 1}</Text>
            {item.changed ? <Badge tone="warning">Đã sửa sau khi gửi — sẽ không hẹn</Badge> : null}
            {item.missing ? <Badge tone="error">Bài không còn</Badge> : null}
          </View>
          {!item.missing ? <SocialPostPreview post={item.post} /> : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Phần thân bản xem trước của một phiếu, không khung — dùng ở chỗ khác màn chi tiết (thẻ trong nhóm "Quản trị – Đội agent"):
 * bài mạng xã hội / lịch đăng / bảng nhãn — giá trị; BE cũ không có preview → tham số đọc từ bodyJson.
 */
export function ActionPreviewContent({ action }: { action: AgentActionView }) {
  const post = socialPostOf(action);
  if (post) return <SocialPostPreview post={post} />;
  const batch = socialBatchOf(action);
  if (batch) return <SocialBatchPreview items={batch} />;
  if (action.preview) return <PreviewFields fields={action.preview.fields ?? []} />;
  const params = actionParams(action.bodyJson);
  if (params === null) return <Text variant="bodySmall" selectable>{action.bodyJson}</Text>;
  return <PreviewFields fields={params.map((p) => ({ label: p.key, value: p.value }))} />;
}

/** Lệnh khác: từng dòng "nhãn — giá trị" (BE đã dịch nhãn, đổi id thành tên). */
export function PreviewFields({ fields }: { fields: AgentPreviewField[] }) {
  if (fields.length === 0) return <Text variant="bodySmall" tone="muted">Lệnh không có tham số.</Text>;
  return (
    <View>
      {fields.map((f, i) => (
        <View key={`${f.label}-${i}`}>
          {i > 0 ? <Divider /> : null}
          <View className="py-2 gap-0.5">
            <Text variant="caption" tone="muted">{f.label}</Text>
            <Text variant="bodySmall" selectable>{f.value}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
