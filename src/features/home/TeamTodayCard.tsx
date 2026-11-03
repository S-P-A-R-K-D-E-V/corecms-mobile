import { useMemo } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { SectionCard, StatCard } from 'src/components/shared';
import { Text, Badge, Avatar, Divider, Skeleton, Icon } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';
import type { ITodayBoardItem, ITodayBoardPartialCover, TodayBoardStatus } from 'src/types/corecms-api';
import { useTodayAttendance } from 'src/features/admin-dashboard/hooks';
import { t } from 'src/i18n';

import { useTodayBoard } from './hooks';
import { changeText, groupByShift, partialCoverText, type ShiftGroup } from './team-today';

// ----------------------------------------------------------------------
// "Nhân sự hôm nay" (chủ / quản lý): mọi người đi làm hôm nay, nhóm theo ca (Sáng / Chiều / Tối, ca Phụ sau cùng), trạng
// thái chấm công lúc này; ca đã đổi / nhận làm thay ghi người đổi; người làm hộ một phần ca hiện dưới ca người nhờ kèm
// khoảng giờ. core-be chưa có /attendance/today-board → lùi về báo cáo công hôm nay: có mặt / đi muộn / số ca (không
// hiện "vắng": báo cáo cũ tính cả ca chưa tới giờ là vắng — 2h sáng ra "6 vắng").
// ----------------------------------------------------------------------

const STATUS: Record<TodayBoardStatus, { key: string; tone: 'success' | 'neutral' | 'warning' | 'error' | 'info'; dot: string }> = {
  not_in: { key: 'home.statusNotIn', tone: 'warning', dot: 'bg-warning' },
  working: { key: 'home.statusWorking', tone: 'success', dot: 'bg-success' },
  upcoming: { key: 'home.statusUpcoming', tone: 'info', dot: 'bg-info' },
  done: { key: 'home.statusDone', tone: 'neutral', dot: 'bg-faint' },
  absent: { key: 'home.statusAbsent', tone: 'error', dot: 'bg-error' },
};

function CoverRow({ cover, ownerName }: { cover: ITodayBoardPartialCover; ownerName: string }) {
  const st = STATUS[cover.status] ?? STATUS.upcoming;
  return (
    <View className="flex-row items-center gap-2 pl-12 pb-2">
      <Icon name="account-clock-outline" size={14} tone="primary" />
      <Text variant="caption" className="flex-1" numberOfLines={2}>
        {partialCoverText(cover, ownerName)}
      </Text>
      <Text variant="caption" tone="muted" className="text-[10px]">{t(st.key)}</Text>
    </View>
  );
}

function Row({ item }: { item: ITodayBoardItem }) {
  const st = STATUS[item.status] ?? STATUS.upcoming;
  const checkIn = item.checkInTime ? dayjs(item.checkInTime).format('HH:mm') : null;
  return (
    <View>
      <View className="flex-row items-center gap-3 py-2">
        <Avatar name={item.staffName} uri={item.avatarUrl ? getStorageUrl(item.avatarUrl) : null} size={36} />
        <View className="flex-1">
          <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{item.staffName}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {item.startTime}–{item.endTime}
            {checkIn ? `  ·  ${t('home.inAt', { time: checkIn })}` : ''}
          </Text>
          {item.change ? (
            <View className="flex-row items-center gap-1">
              <Icon name={item.change.kind === 'swap' ? 'swap-horizontal' : 'account-switch-outline'} size={13} tone="info" />
              <Text variant="caption" tone="primary" numberOfLines={1} className="flex-1">{changeText(item.change)}</Text>
            </View>
          ) : null}
        </View>
        <View className="items-end gap-1">
          <View className="flex-row justify-end">
            <Badge tone={st.tone}>{t(st.key)}</Badge>
          </View>
          {item.lateMinutes > 0 ? (
            <Text variant="caption" tone="warning" className="text-[10px] font-semibold">{t('home.lateBy', { n: item.lateMinutes })}</Text>
          ) : null}
        </View>
      </View>
      {(item.partialCovers ?? []).map((c) => (
        <CoverRow key={c.postId} cover={c} ownerName={item.staffName} />
      ))}
    </View>
  );
}

function Group({ group }: { group: ShiftGroup }) {
  return (
    <View className="mt-2">
      <View className="flex-row items-center gap-2 py-1">
        <Text variant="caption" className="font-bold">{group.name || '—'}</Text>
        <Text variant="caption" tone="muted" className="flex-1">
          {group.startTime}–{group.endTime}
        </Text>
        <Text variant="caption" tone="muted">{t('home.teamPeople', { n: group.items.length })}</Text>
      </View>
      {group.items.map((it, i) => (
        <View key={it.assignmentId}>
          {i > 0 ? <Divider className="ml-12" /> : null}
          <Row item={it} />
        </View>
      ))}
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
      shifts: rows.reduce((s, r) => s + (r.totalShifts ?? 0), 0),
    };
  }, [data]);
  if (isLoading) return <Skeleton width="100%" height={78} radius={12} />;
  return (
    <View className="flex-row gap-3">
      <StatCard value={stats.present} label={t('admin.present')} tone="success" />
      <StatCard value={stats.late} label={t('admin.late')} tone="warning" />
      <StatCard value={stats.shifts} label={t('home.shiftsToday')} tone="info" />
    </View>
  );
}

function CountChip({ icon, tone, label, n }: { icon: string; tone: 'warning' | 'info' | 'primary'; label: string; n?: number }) {
  if (!n) return null;
  return (
    <View className="flex-row items-center gap-1">
      <Icon name={icon as any} size={13} tone={tone} />
      <Text variant="caption" tone={tone === 'warning' ? 'warning' : 'primary'} className="font-semibold">
        {label} {n}
      </Text>
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

  const groups = useMemo(() => groupByShift(data?.items ?? []), [data]);

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
      ) : groups.length === 0 ? (
        <View className="items-center py-3 gap-1">
          <Icon name="calendar-blank-outline" size={26} tone="faint" />
          <Text variant="bodySmall" tone="muted">{t('home.teamEmpty')}</Text>
        </View>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-x-3 gap-y-1.5">
            {chips.map(([status, n]) => (
              <View key={status} className="flex-row items-center gap-1.5">
                <View className={`w-2 h-2 rounded-full ${STATUS[status].dot}`} />
                <Text variant="caption" tone="muted">
                  {t(STATUS[status].key)} <Text variant="caption" className="font-bold">{n}</Text>
                </Text>
              </View>
            ))}
            <CountChip icon="clock-alert-outline" tone="warning" label={t('admin.late')} n={data.counts.late} />
            <CountChip icon="swap-horizontal" tone="info" label={t('home.teamChanged')} n={data.counts.changed} />
            <CountChip icon="account-clock-outline" tone="primary" label={t('home.teamCovers')} n={data.counts.partialCovers} />
          </View>
          {groups.map((g) => (
            <Group key={g.key} group={g} />
          ))}
        </>
      )}
    </SectionCard>
  );
}
