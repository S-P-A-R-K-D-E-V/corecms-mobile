import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { SectionCard, StatCard } from 'src/components/shared';
import { Text, Badge, Avatar, Divider, Pressable, Skeleton, Icon } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';
import type { ITodayBoardItem, TodayBoardStatus } from 'src/types/corecms-api';
import { useTodayAttendance } from 'src/features/admin-dashboard/hooks';
import { t } from 'src/i18n';

import { useTodayBoard } from './hooks';

// ----------------------------------------------------------------------
// "Nhân sự hôm nay" (chủ / quản lý): ai đang làm, ai chưa vào ca, ai sắp tới… theo giờ hiện tại.
// core-be chưa có /attendance/today-board → lùi về 3 số có mặt / muộn / vắng của báo cáo công hôm nay.
// ----------------------------------------------------------------------

const MAX_ROWS = 6;

const STATUS: Record<TodayBoardStatus, { key: string; tone: 'success' | 'neutral' | 'warning' | 'error' | 'info'; dot: string }> = {
  not_in: { key: 'home.statusNotIn', tone: 'warning', dot: 'bg-warning' },
  working: { key: 'home.statusWorking', tone: 'success', dot: 'bg-success' },
  upcoming: { key: 'home.statusUpcoming', tone: 'info', dot: 'bg-info' },
  done: { key: 'home.statusDone', tone: 'neutral', dot: 'bg-faint' },
  absent: { key: 'home.statusAbsent', tone: 'error', dot: 'bg-error' },
};

function Row({ item }: { item: ITodayBoardItem }) {
  const st = STATUS[item.status] ?? STATUS.upcoming;
  const checkIn = item.checkInTime ? dayjs(item.checkInTime).format('HH:mm') : null;
  return (
    <View className="flex-row items-center gap-3 py-2">
      <Avatar name={item.staffName} uri={item.avatarUrl ? getStorageUrl(item.avatarUrl) : null} size={36} />
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{item.staffName}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {item.shiftName ? `${item.shiftName} · ` : ''}{item.startTime}–{item.endTime}
          {checkIn ? `  ·  ${t('home.inAt', { time: checkIn })}` : ''}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Badge tone={st.tone}>{t(st.key)}</Badge>
        {item.lateMinutes > 0 ? (
          <Text variant="caption" tone="warning" className="text-[10px] font-semibold">{t('home.lateBy', { n: item.lateMinutes })}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Fallback() {
  const { data, isLoading } = useTodayAttendance();
  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      present: rows.reduce((s, r) => s + (r.presentShifts ?? 0), 0),
      late: rows.reduce((s, r) => s + (r.lateCount ?? 0), 0),
      absent: rows.reduce((s, r) => s + (r.absentShifts ?? 0), 0),
    };
  }, [data]);
  if (isLoading) return <Skeleton width="100%" height={78} radius={12} />;
  return (
    <View className="flex-row gap-3">
      <StatCard value={stats.present} label={t('admin.present')} tone="success" />
      <StatCard value={stats.late} label={t('admin.late')} tone="warning" />
      <StatCard value={stats.absent} label={t('admin.absent')} tone="error" />
    </View>
  );
}

export function TeamTodayCard() {
  const { data, isLoading, isError } = useTodayBoard();

  const chips = useMemo(() => {
    if (!data) return [];
    const c = data.counts;
    return (
      [
        ['working', c.working],
        ['not_in', c.notIn],
        ['upcoming', c.upcoming],
        ['done', c.done],
        ['absent', c.absent],
      ] as [TodayBoardStatus, number][]
    ).filter(([, n]) => n > 0);
  }, [data]);

  const items = data?.items ?? [];
  const more = Math.max(0, items.length - MAX_ROWS);

  return (
    <SectionCard
      title={t('home.teamToday')}
      icon="account-group-outline"
      right={<Text variant="caption" tone="muted">{dayjs().format('DD/MM')}</Text>}
      bodyClassName="pt-0"
    >
      {isLoading ? (
        <Skeleton width="100%" height={120} radius={12} />
      ) : isError || !data ? (
        <Fallback />
      ) : items.length === 0 ? (
        <View className="items-center py-3 gap-1">
          <Icon name="calendar-blank-outline" size={26} tone="faint" />
          <Text variant="bodySmall" tone="muted">{t('home.teamEmpty')}</Text>
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-x-3 gap-y-1.5 mb-1.5">
            {chips.map(([status, n]) => (
              <View key={status} className="flex-row items-center gap-1.5">
                <View className={`w-2 h-2 rounded-full ${STATUS[status].dot}`} />
                <Text variant="caption" tone="muted">
                  {t(STATUS[status].key)} <Text variant="caption" className="font-bold">{n}</Text>
                </Text>
              </View>
            ))}
            {data.counts.late > 0 ? (
              <View className="flex-row items-center gap-1">
                <Icon name="clock-alert-outline" size={13} tone="warning" />
                <Text variant="caption" tone="warning" className="font-semibold">
                  {t('admin.late')} {data.counts.late}
                </Text>
              </View>
            ) : null}
          </View>
          {items.slice(0, MAX_ROWS).map((it, i) => (
            <View key={it.assignmentId}>
              {i > 0 ? <Divider className="ml-12" /> : null}
              <Row item={it} />
            </View>
          ))}
          {more > 0 ? (
            <Pressable onPress={() => router.push('/manage/schedule' as any)} className="flex-row items-center justify-center gap-1 pt-2">
              <Text variant="caption" tone="primary" className="font-semibold">{t('home.teamMore', { n: more })}</Text>
              <Icon name="chevron-right" size={14} tone="primary" />
            </Pressable>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}
