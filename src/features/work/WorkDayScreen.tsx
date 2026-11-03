import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, EmptyState } from 'src/components/shared';
import { Text, Button, Badge, Divider, Icon, Pressable, SegmentedControl, Skeleton } from 'src/components/ui';
import { toast, confirm, showActionSheet, type ActionItem } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { cancelWorkTask, completeWorkTask, getWorkToday } from 'src/api/hr';
import { reviewCleaningTask, skipCleaningTask } from 'src/api/cleaning';
import { manageShiftWork } from 'src/api/inspection';
import { useAuthContext } from 'src/auth/auth-context';
import type { IWorkTodayItem, IWorkTodayPerson } from 'src/types/hr';

import { WORK_STATUS, itemRoute, itemSubtitle, progressText } from './work-today';
import { canManageAny, dayLabel, itemActions, removeConfirmMessage, unfinishedOnly, type WorkDayAction } from './work-day';

// ----------------------------------------------------------------------
// Việc theo ngày (chủ / quản lý): mọi việc của một ngày theo từng người — việc trong ca, vệ sinh theo lịch, việc giao riêng —
// đổi ngày bằng mũi tên. Bấm một việc chưa xong để đánh dấu xong hoặc gỡ (như chưa giao: nhân viên không thấy, không tính).
// Số liệu từ GET /work-today?date=; mỗi lệnh đi qua API gốc của loại việc đó.
// ----------------------------------------------------------------------

const EMPTY_GUID = '00000000-0000-0000-0000-000000000000';

type Filter = 'open' | 'all';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'Chưa xong' },
  { key: 'all', label: 'Tất cả' },
];

function run(item: IWorkTodayItem, action: WorkDayAction, date: string): Promise<unknown> {
  switch (item.source) {
    case 'work_task':
      return action === 'done' ? completeWorkTask(item.id) : cancelWorkTask(item.id);
    case 'cleaning':
      return action === 'done' ? reviewCleaningTask(item.id, { status: 'Passed' }) : skipCleaningTask(item.id);
    case 'shift_work':
      return manageShiftWork(action, {
        date,
        shiftScheduleId: item.shiftScheduleId!,
        branchKey: item.branchKey ?? EMPTY_GUID,
        itemId: item.id,
      });
  }
}

function ItemRow({ item, onPress }: { item: IWorkTodayItem; onPress: (() => void) | null }) {
  return (
    <Pressable disabled={!onPress} onPress={onPress ?? undefined} className="flex-row items-center gap-2 py-2">
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>
          {item.title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {itemSubtitle(item)}
        </Text>
      </View>
      <Badge tone={WORK_STATUS[item.status]?.tone ?? 'neutral'}>{WORK_STATUS[item.status]?.label ?? item.status}</Badge>
      {onPress ? <Icon name="dots-vertical" size={18} tone="muted" /> : null}
    </Pressable>
  );
}

function PersonCard({ person, onItem }: { person: IWorkTodayPerson; onItem: (item: IWorkTodayItem) => (() => void) | null }) {
  return (
    <SectionCard
      title={person.staffName}
      right={
        <Text variant="caption" tone={person.overdue > 0 ? 'error' : 'muted'} className="font-semibold">
          {progressText(person)}
        </Text>
      }
      bodyClassName="pt-0"
    >
      {person.items.map((item, i) => (
        <View key={`${item.source}:${item.id}`}>
          {i > 0 ? <Divider /> : null}
          <ItemRow item={item} onPress={onItem(item)} />
        </View>
      ))}
    </SectionCard>
  );
}

export function WorkDayScreen() {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const today = dayjs().format('YYYY-MM-DD');
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState<Filter>('open');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['work-day', date],
    queryFn: () => getWorkToday(date),
  });

  const people = data ? (filter === 'open' ? unfinishedOnly(data.people) : data.people) : [];

  async function apply(item: IWorkTodayItem, action: WorkDayAction) {
    if (action === 'remove') {
      const ok = await confirm({
        title: 'Gỡ việc',
        message: removeConfirmMessage(item),
        confirmText: 'Gỡ',
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await run(item, action, date);
      toast.success(action === 'done' ? 'Đã đánh dấu xong' : 'Đã gỡ việc');
      qc.invalidateQueries({ queryKey: ['work-day'] });
      qc.invalidateQueries({ queryKey: ['home', 'work-today'] });
      qc.invalidateQueries({ queryKey: ['work-task-review'] });
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(false);
    }
  }

  /** Bấm một việc: menu theo quyền + trạng thái; không có gì để làm → dòng không bấm được. */
  function onItem(item: IWorkTodayItem): (() => void) | null {
    const actions = itemActions(item, date, user, today);
    const route = itemRoute(item, user);
    if (busy || (actions.length === 0 && !route)) return null;
    return () => {
      const options: ActionItem[] = [];
      if (actions.includes('done')) options.push({ label: 'Đánh dấu xong', icon: 'check-circle-outline', onPress: () => void apply(item, 'done') });
      if (route) options.push({ label: 'Xem ảnh / chấm', icon: 'image-search-outline', onPress: () => router.push(route as any) });
      if (actions.includes('remove')) options.push({ label: 'Gỡ khỏi ngày', icon: 'close-circle-outline', destructive: true, onPress: () => void apply(item, 'remove') });
      void showActionSheet({ title: item.title, message: itemSubtitle(item), options });
    };
  }

  const shift = (days: number) => setDate((d) => dayjs(d).add(days, 'day').format('YYYY-MM-DD'));

  return (
    <Screen scroll refreshing={isFetching && !isLoading} onRefresh={refetch}>
      <AppHeader title="Việc theo ngày" back />

      <View className="flex-row items-center justify-between gap-2 py-1">
        <Pressable
          onPress={() => shift(-1)}
          accessibilityLabel="Ngày trước"
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-left" size={20} tone="default" />
        </Pressable>
        <Pressable onPress={() => setDate(today)} disabled={date === today} className="items-center">
          <Text variant="subtitle">{dayLabel(date, today)}</Text>
          {date !== today ? <Text variant="caption" tone="primary">Về hôm nay</Text> : null}
        </Pressable>
        <Pressable
          onPress={() => shift(1)}
          accessibilityLabel="Ngày sau"
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-right" size={20} tone="default" />
        </Pressable>
      </View>

      <SegmentedControl segments={FILTERS} value={filter} onChange={(k) => setFilter(k as Filter)} className="my-1" />

      {data ? (
        <View className="flex-row flex-wrap gap-x-3 gap-y-1 py-1">
          <Text variant="caption" tone="muted">
            Xong <Text variant="caption" className="font-bold">{data.counts.done}/{data.counts.total}</Text>
          </Text>
          <Text variant="caption" tone="muted">
            Chưa xong <Text variant="caption" className="font-bold">{data.counts.pending}</Text>
          </Text>
          {data.counts.overdue > 0 ? (
            <Text variant="caption" tone="error" className="font-semibold">
              Quá hạn / không đạt {data.counts.overdue}
            </Text>
          ) : null}
        </View>
      ) : null}
      {canManageAny(user) ? (
        <Text variant="caption" tone="muted" className="pb-1">
          Bấm một việc chưa xong để đánh dấu xong hoặc gỡ khỏi ngày.
        </Text>
      ) : null}

      {isLoading ? (
        <View className="gap-3 pt-2">
          <Skeleton width="100%" height={120} radius={16} />
          <Skeleton width="100%" height={120} radius={16} />
        </View>
      ) : isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được việc trong ngày: {extractApiError(error)}</Text>
          <Button size="sm" variant="outline" onPress={() => refetch()}>Thử lại</Button>
        </View>
      ) : people.length === 0 ? (
        <EmptyState
          icon="clipboard-check-outline"
          title={filter === 'open' && (data?.counts.total ?? 0) > 0 ? 'Đã xong hết việc' : 'Không có việc nào'}
          description={filter === 'open' && (data?.counts.total ?? 0) > 0 ? 'Chọn "Tất cả" để xem lại.' : 'Ngày này chưa có việc giao cho ai.'}
        />
      ) : (
        <View className="gap-3 pt-1">
          {people.map((p) => (
            <PersonCard key={p.staffId} person={p} onItem={onItem} />
          ))}
        </View>
      )}
    </Screen>
  );
}
