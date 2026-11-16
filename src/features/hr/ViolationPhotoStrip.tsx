import { useState } from 'react';
import { Image, Modal, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';

import { Icon, Pressable, Text } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';
import type { IViolationPhoto } from 'src/types/hr';

// ----------------------------------------------------------------------
// Ảnh minh chứng của một lần ghi nhận: hàng thumbnail 48px, bấm để xem toàn màn hình (vuốt ngang). Ảnh đã tự xoá sau 90 ngày
// hiện ô gạch chéo + dòng chú thích — điểm trừ không đổi.
// ----------------------------------------------------------------------

export function ViolationPhotoStrip({ photos }: { photos?: IViolationPhoto[] | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!photos?.length) return null;

  const live = photos.filter((p) => !p.deleted && p.url);
  const deleted = photos.length - live.length;
  const keepUntil = live.length ? dayjs(live.reduce((a, p) => (p.expiresAt < a ? p.expiresAt : a), live[0].expiresAt)) : null;

  return (
    <View className="gap-1">
      <View className="flex-row gap-1.5">
        {live.map((p, i) => (
          <Pressable key={p.id} onPress={() => setOpen(i)} accessibilityLabel={`Xem ảnh minh chứng ${i + 1}`}>
            <Image source={{ uri: getStorageUrl(p.url) }} style={{ width: 48, height: 48, borderRadius: 8 }} />
          </Pressable>
        ))}
        {Array.from({ length: deleted }, (_, i) => (
          <View key={`gone-${i}`} className="w-12 h-12 rounded-[8px] border border-dashed border-line dark:border-line-dark items-center justify-center">
            <Icon name="image-off-outline" size={18} tone="faint" />
          </View>
        ))}
      </View>
      <Text variant="caption" tone="muted">
        {deleted > 0 ? `Ảnh đã tự xoá sau 90 ngày (${deleted} ảnh)` : keepUntil ? `Ảnh lưu tới ${keepUntil.format('DD/MM/YYYY')}` : ''}
      </Text>

      <Modal visible={open != null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View className="flex-1 bg-black">
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentOffset={{ x: (open ?? 0) * width, y: 0 }}
            maximumZoomScale={3}
          >
            {live.map((p) => (
              <Image key={p.id} source={{ uri: getStorageUrl(p.url) }} resizeMode="contain" style={{ width, height }} />
            ))}
          </ScrollView>
          <Pressable
            onPress={() => setOpen(null)}
            accessibilityLabel="Đóng ảnh"
            className="absolute right-4 w-10 h-10 rounded-full bg-black/60 items-center justify-center"
            style={{ top: insets.top + 8 }}
          >
            <Icon name="close" size={22} tone="inverse" />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
