import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader } from 'src/components/shared';
import { Text, Icon, Pressable } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { CLEANING_FEATURE, SHIFT_SCHEDULING_FEATURE } from 'src/features/launcher/registry';
import { MyFaultsSection } from 'src/features/inspection/MyFaultsSection';
import { ShiftWorkSection } from 'src/features/work/ShiftWorkSection';
import { CorrectiveActionsSection } from 'src/features/work/CorrectiveActionsSection';
import { AssignedTasksSection } from './AssignedTasksSection';
import { LegacyCleaningSection } from './LegacyCleaningSection';

// ----------------------------------------------------------------------
// Việc của tôi (Công việc): việc trong ca của ngày (hạng mục nhân viên tự làm, chụp ảnh khi xong; trưởng ca / quản lý
// kiểm), lỗi cần sửa của tôi, việc giao riêng + sửa tận gốc giao cho tôi, và việc theo lịch cũ nếu cửa hàng chưa chuyển.
// ----------------------------------------------------------------------

/** Mọi query của màn — kéo để tải lại cả màn. */
const SCREEN_QUERY_ROOTS = ['shift-work', 'inspection', 'hr', 'corrective-actions', 'cleaning'];

export function CleaningChecklistScreen() {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [refreshing, setRefreshing] = useState(false);

  const features = user?.enabledFeatures ?? [];
  const work = features.includes(SHIFT_SCHEDULING_FEATURE);
  const legacy = features.includes(CLEANING_FEATURE);

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await qc
          .invalidateQueries({ predicate: (q) => SCREEN_QUERY_ROOTS.includes(q.queryKey[0] as string) })
          .catch(() => {});
        setRefreshing(false);
      }}
    >
      <AppHeader title="Việc của tôi" back />
      {/* Lỗi cần sửa lên đầu: mục B chỉ có 15 phút. */}
      <MyFaultsSection enabled={work} />
      {!work && !legacy ? (
        <Text variant="bodySmall" tone="muted">Cửa hàng chưa bật tính năng công việc.</Text>
      ) : null}
      <Text variant="subtitle">Việc trong ca</Text>

      <View className="flex-row items-center justify-between gap-2 py-1">
        <Pressable
          onPress={() => setDate((d) => dayjs(d).subtract(1, 'day').format('YYYY-MM-DD'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-left" size={20} tone="default" />
        </Pressable>
        <Text variant="subtitle" className="capitalize">{dayjs(date).format('dddd, DD/MM/YYYY')}</Text>
        <Pressable
          onPress={() => setDate((d) => dayjs(d).add(1, 'day').format('YYYY-MM-DD'))}
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-right" size={20} tone="default" />
        </Pressable>
      </View>

      <ShiftWorkSection date={date} enabled={work} />
      <LegacyCleaningSection date={date} enabled={legacy} />

      {work ? (
        <>
          <AssignedTasksSection />
          <CorrectiveActionsSection />
        </>
      ) : null}
    </Screen>
  );
}
