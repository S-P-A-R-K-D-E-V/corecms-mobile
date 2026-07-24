import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';

import { Text, Icon, Pressable } from 'src/components/ui';
import { getMyCleaningChecklist } from 'src/api/cleaning';
import { extractApiError } from 'src/services/error';

// ── Cleaning checklist summary (thẻ tóm tắt + link, không nhúng cả checklist) ─
// Tách thành file riêng (thay vì khai báo trong CheckinScreen.tsx) để test được
// độc lập mà không phải kéo theo toàn bộ cây import của màn check-in.
export function CleaningChecklistSummaryCard() {
  const today = dayjs().format('YYYY-MM-DD');
  const { data, isError, error } = useQuery({
    queryKey: ['cleaning', 'my-checklist', today],
    queryFn: () => getMyCleaningChecklist(today),
  });

  if (isError) {
    // Card này chỉ là tóm tắt phụ trên màn điểm danh - ẩn lặng lẽ khi lỗi thay vì
    // chèn banner lỗi (quyết định sản phẩm có chủ đích), nhưng vẫn log để không
    // im lặng hoàn toàn khi debug qua device log. Lỗi thật vẫn hiện rõ ràng (banner +
    // nút Thử lại) ở màn "checklist của tôi" đầy đủ (CleaningChecklistScreen).
    console.error('[CleaningChecklistSummaryCard] fetch failed:', extractApiError(error));
    return null;
  }

  const tasks = (data ?? []).flatMap((shift) => shift.tasks);
  if (tasks.length === 0) return null;

  const doneCount = tasks.filter((t) => t.status !== 'Pending').length;
  const failedCount = tasks.filter((t) => t.status === 'Failed').length;

  return (
    <Pressable
      onPress={() => router.push('/cleaning' as any)}
      className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-bg dark:bg-surface-dark"
    >
      <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
        <Icon name="broom" size={20} tone="primary" />
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-[14px]">Checklist vệ sinh ca này</Text>
        <Text variant="caption" tone="muted">
          {doneCount}/{tasks.length} đầu việc đã xong
          {failedCount > 0 ? ` · ${failedCount} không đạt` : ''}
        </Text>
      </View>
      <Icon name="chevron-right" size={20} tone="faint" />
    </Pressable>
  );
}
