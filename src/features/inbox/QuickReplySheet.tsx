import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Pressable, Spinner, Text, TextField } from 'src/components/ui';
import type { QuickReply } from 'src/api/inbox';

import { filterQuickReplies } from './inbox-format';
import { useQuickReplies } from './hooks';

// Chọn mẫu trả lời nhanh (GET conversation-quick-replies): tìm theo phím tắt / tiêu đề / nội dung, chạm để chèn vào ô gõ.
// Thêm / sửa mẫu ở web (Hộp thư khách → Cài đặt).

export function QuickReplySheet({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (reply: QuickReply) => void;
}) {
  const query = useQuickReplies(visible);
  const [search, setSearch] = useState('');
  const list = useMemo(() => filterQuickReplies(query.data ?? [], search), [query.data, search]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Mẫu trả lời nhanh">
      <View className="gap-2 pb-2">
        <TextField icon="magnify" placeholder="Tìm mẫu…" value={search} onChangeText={setSearch} autoCorrect={false} />
        {query.isLoading ? (
          <View className="py-6"><Spinner /></View>
        ) : query.isError ? (
          <Text variant="bodySmall" tone="error" className="py-4 text-center">Không tải được mẫu trả lời.</Text>
        ) : list.length === 0 ? (
          <Text variant="bodySmall" tone="muted" className="py-4 text-center">
            {search ? 'Không có mẫu khớp.' : 'Chưa có mẫu nào — thêm trên web: Hộp thư khách → Cài đặt.'}
          </Text>
        ) : (
          list.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => onPick(r)}
              className="rounded-xl px-3 py-2.5 bg-ink/5 dark:bg-white/5 gap-0.5"
              accessibilityRole="button"
            >
              <View className="flex-row items-center gap-2">
                <Text variant="caption" tone="primary" className="font-semibold">/{r.shortcut}</Text>
                <Text variant="bodySmall" className="font-semibold flex-1" numberOfLines={1}>{r.title}</Text>
                {r.imageUrls.length > 0 ? (
                  <Text variant="caption" tone="muted">{r.imageUrls.length} ảnh</Text>
                ) : null}
              </View>
              <Text variant="caption" tone="muted" numberOfLines={2}>{r.text}</Text>
            </Pressable>
          ))
        )}
      </View>
    </Sheet>
  );
}
