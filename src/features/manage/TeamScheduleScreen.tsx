import { useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Icon, Pressable, Skeleton, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import type { IShiftAssignment } from 'src/types/corecms-api';

import { useTeamAssignments } from './hooks';

dayjs.locale('vi');

// ----------------------------------------------------------------------
// Lịch đội ngũ (Manager/Admin): xem ca của MỌI nhân viên theo tuần — chọn
// ngày trên dải 7 ngày, danh sách gom theo ca (giờ bắt đầu → tên ca → NV).
// Chỉ ĐỌC ở Phase 2A; xếp ca / đổi ca hộ là màn riêng (Phase 2B).
// ----------------------------------------------------------------------

const STATUS_META: Record<IShiftAssignment['status'], { tone: 'info' | 'success' | 'error' | 'warning'; label: string }> = {
  Scheduled: { tone: 'info', label: 'Đã xếp' },
  Present: { tone: 'success', label: 'Có mặt' },
  Absent: { tone: 'error', label: 'Vắng' },
  Late: { tone: 'warning', label: 'Muộn' },
};

function DayStrip({
  weekStart,
  selected,
  onSelectDate,
  onShiftWeek,
  countByDate,
}: {
  weekStart: dayjs.Dayjs;
  selected: string;
  onSelectDate: (iso: string) => void;
  onShiftWeek: (dir: -1 | 1) => void;
  countByDate: Record<string, number>;
}) {
  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));
  const todayIso = dayjs().format('YYYY-MM-DD');

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Pressable onPress={() => onShiftWeek(-1)} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark">
          <Icon name="chevron-left" size={20} tone="muted" />
        </Pressable>
        <Text variant="subtitle">
          {weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}
        </Text>
        <Pressable onPress={() => onShiftWeek(1)} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark">
          <Icon name="chevron-right" size={20} tone="muted" />
        </Pressable>
      </View>

      <View className="flex-row gap-1.5">
        {days.map((d) => {
          const iso = d.format('YYYY-MM-DD');
          const active = iso === selected;
          const isToday = iso === todayIso;
          const count = countByDate[iso] ?? 0;
          return (
            <Pressable
              key={iso}
              onPress={() => { haptics.selection(); onSelectDate(iso); }}
              className={cn(
                'flex-1 items-center rounded-2xl py-2 gap-0.5',
                active ? 'bg-primary' : 'bg-surface dark:bg-surface-dark',
                !active && isToday && 'border border-primary/40'
              )}
            >
              <Text variant="caption" className={cn('text-[10px] capitalize', active ? 'text-white/80' : 'text-muted')}>
                {d.format('dd')}
              </Text>
              <Text className={cn('text-[15px] font-bold', active ? 'text-white' : 'text-ink dark:text-white')}>
                {d.format('DD')}
              </Text>
              <View className={cn('min-w-[16px] h-4 px-1 rounded-full items-center justify-center', active ? 'bg-white/25' : count > 0 ? 'bg-primary-soft' : 'bg-transparent')}>
                {count > 0 ? (
                  <Text className={cn('text-[9px] font-bold', active ? 'text-white' : 'text-primary')}>{count}</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ShiftGroup({ title, time, items }: { title: string; time: string; items: IShiftAssignment[] }) {
  return (
    <Card className="p-4 gap-1">
      <View className="flex-row items-center gap-2 mb-1">
        <Icon name="clock-outline" size={16} tone="primary" />
        <Text variant="subtitle" className="flex-1">{title}</Text>
        <Text variant="caption" tone="muted">{time}</Text>
      </View>
      {items.map((a, i) => {
        const meta = STATUS_META[a.status] ?? STATUS_META.Scheduled;
        return (
          <View key={a.id}>
            {i > 0 ? <Divider /> : null}
            <View className="flex-row items-center gap-3 py-2">
              <View className="w-8 h-8 rounded-full bg-primary-soft items-center justify-center">
                <Text className="text-primary font-bold text-xs">
                  {(a.staffName ?? '?').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text variant="bodySmall" className="font-medium">{a.staffName}</Text>
                {a.note ? <Text variant="caption" tone="muted" numberOfLines={1}>{a.note}</Text> : null}
              </View>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

export function TeamScheduleScreen() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [selected, setSelected] = useState(() => dayjs().format('YYYY-MM-DD'));

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const { data, isLoading, isError, refetch, isFetching } = useTeamAssignments(fromDate, toDate);

  // Số ca mỗi ngày (badge trên dải ngày) + nhóm ca của ngày đang chọn.
  const { countByDate, groups } = useMemo(() => {
    const counts: Record<string, number> = {};
    const byShift = new Map<string, { title: string; time: string; items: IShiftAssignment[] }>();
    for (const a of data ?? []) {
      const dateIso = dayjs(a.date).format('YYYY-MM-DD');
      counts[dateIso] = (counts[dateIso] ?? 0) + 1;
      if (dateIso !== selected) continue;
      const key = `${a.startTime}-${a.shiftTemplateName}`;
      if (!byShift.has(key)) {
        byShift.set(key, {
          title: a.shiftTemplateName,
          time: `${a.startTime} – ${a.endTime}`,
          items: [],
        });
      }
      byShift.get(key)!.items.push(a);
    }
    const sorted = [...byShift.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    return { countByDate: counts, groups: sorted };
  }, [data, selected]);

  function shiftWeek(dir: -1 | 1) {
    haptics.light();
    const next = weekStart.add(dir, 'week');
    setWeekStart(next);
    setSelected(next.format('YYYY-MM-DD'));
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Lịch đội ngũ" subtitle="Ca làm của mọi nhân viên" back />

      <DayStrip
        weekStart={weekStart}
        selected={selected}
        onSelectDate={setSelected}
        onShiftWeek={shiftWeek}
        countByDate={countByDate}
      />

      {isLoading ? (
        <View className="gap-3">
          {[0, 1].map((i) => (
            <Card key={i} className="p-4 gap-3">
              <Skeleton width={160} height={16} />
              <Skeleton width="100%" height={40} radius={10} />
              <Skeleton width="100%" height={40} radius={10} />
            </Card>
          ))}
        </View>
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon="calendar-blank-outline"
          title="Không có ca nào"
          description={`Chưa có nhân viên nào được xếp ca ngày ${dayjs(selected).format('DD/MM')}.`}
        />
      ) : (
        groups.map((g) => <ShiftGroup key={`${g.time}-${g.title}`} title={g.title} time={g.time} items={g.items} />)
      )}
    </Screen>
  );
}
