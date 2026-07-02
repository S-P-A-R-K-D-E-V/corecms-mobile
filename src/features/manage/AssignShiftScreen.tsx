import { useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

import { Screen, AppHeader, EmptyState, ErrorView, ToggleRow } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Pressable, Skeleton, Divider, Avatar } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { getStorageUrl } from 'src/api/axios';
import type { IShiftSchedule } from 'src/types/corecms-api';

import { useAllStaff, useBulkAssign, useShiftSchedules } from './hooks';

dayjs.locale('vi');

// ----------------------------------------------------------------------
// Xếp ca tự động (phân công hàng loạt) — như core-fe: chọn 1 ca + nhiều nhân
// viên + khoảng tuần, BE tự tạo phân công cho mọi ngày ca lặp lại trong khoảng
// (lọc thêm theo thứ nếu chọn). "Ghi đè" = gỡ NV không được chọn khỏi ca.
// Luật ca-đã-bắt-đầu/checkin do BE ShiftMutationGuard chặn khi ghi.
// ----------------------------------------------------------------------

// WeekDays bitmask, index JS getDay(): 0=CN. Chip hiển thị T2→CN.
const WEEKDAYS: { label: string; bit: number }[] = [
  { label: 'T2', bit: 1 },
  { label: 'T3', bit: 2 },
  { label: 'T4', bit: 4 },
  { label: 'T5', bit: 8 },
  { label: 'T6', bit: 16 },
  { label: 'T7', bit: 32 },
  { label: 'CN', bit: 64 },
];

function ScheduleChip({ s, active, onPress }: { s: IShiftSchedule; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'px-3.5 py-2 rounded-2xl border',
        active ? 'bg-primary border-primary' : 'bg-surface dark:bg-surface-dark border-line/60 dark:border-line-dark'
      )}
    >
      <Text variant="bodySmall" className={cn('font-semibold', active ? 'text-white' : undefined)}>
        {s.templateName}
      </Text>
      <Text variant="caption" className={cn(active ? 'text-white/80' : 'text-muted')}>
        {s.startTime} – {s.endTime}
      </Text>
    </Pressable>
  );
}

export function AssignShiftScreen() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());
  const [dayBits, setDayBits] = useState<number>(0); // 0 = mọi ngày ca lặp lại
  const [overwrite, setOverwrite] = useState(false);

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');

  const schedulesQ = useShiftSchedules(fromDate, toDate);
  const staffQ = useAllStaff();
  const mutation = useBulkAssign();

  const schedules = useMemo(
    () => (schedulesQ.data ?? []).filter((s) => s.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedulesQ.data]
  );
  const schedule = schedules.find((s) => s.id === scheduleId) ?? null;

  const staffAvatar = (u: { avatarUrl?: string; profileImageUrl?: string }) =>
    getStorageUrl(u.avatarUrl || u.profileImageUrl) || null;

  function toggleStaff(id: string) {
    haptics.selection();
    setStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleDay(bit: number) {
    haptics.selection();
    setDayBits((prev) => prev ^ bit);
  }
  function shiftWeek(dir: -1 | 1) {
    haptics.light();
    setWeekStart((w) => w.add(dir, 'week'));
  }

  async function submit() {
    if (!schedule || staffIds.size === 0) return;
    const dayText = dayBits === 0 ? 'mọi ngày ca lặp lại' : WEEKDAYS.filter((d) => dayBits & d.bit).map((d) => d.label).join(', ');
    const ok = await confirm({
      title: 'Phân công hàng loạt',
      message:
        `Ca ${schedule.templateName} · ${staffIds.size} nhân viên\n` +
        `Tuần ${weekStart.format('DD/MM')} – ${weekStart.add(6, 'day').format('DD/MM')} (${dayText})` +
        (overwrite ? '\n⚠️ Ghi đè: gỡ nhân viên không được chọn khỏi ca.' : ''),
      confirmText: 'Phân công',
    });
    if (!ok) return;
    try {
      const res = await mutation.mutateAsync({
        staffIds: [...staffIds],
        shiftScheduleId: schedule.id,
        fromDate,
        toDate,
        filterDays: dayBits === 0 ? undefined : dayBits,
        overwrite,
      });
      haptics.success();
      toast.success(`Đã tạo ${res.count} phân công.`, 'Xếp ca thành công');
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Không phân công được');
    }
  }

  const loading = schedulesQ.isLoading || staffQ.isLoading;
  const canSubmit = !!schedule && staffIds.size > 0;

  return (
    <Screen scroll tabBarInset={false} refreshing={schedulesQ.isFetching} onRefresh={schedulesQ.refetch}>
      <AppHeader title="Xếp ca tự động" subtitle="Phân công hàng loạt theo tuần" back />

      {/* Tuần áp dụng */}
      <Card className="p-3 flex-row items-center justify-between">
        <Pressable onPress={() => shiftWeek(-1)} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark">
          <Icon name="chevron-left" size={20} tone="muted" />
        </Pressable>
        <View className="items-center">
          <Text variant="caption" tone="muted">Tuần áp dụng</Text>
          <Text variant="subtitle">{weekStart.format('DD/MM')} – {weekStart.add(6, 'day').format('DD/MM/YYYY')}</Text>
        </View>
        <Pressable onPress={() => shiftWeek(1)} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark">
          <Icon name="chevron-right" size={20} tone="muted" />
        </Pressable>
      </Card>

      {loading ? (
        <View className="gap-3">
          <Skeleton width="100%" height={54} radius={16} />
          <Skeleton width="100%" height={220} radius={16} />
        </View>
      ) : schedulesQ.isError || staffQ.isError ? (
        <ErrorView onRetry={() => { schedulesQ.refetch(); staffQ.refetch(); }} />
      ) : schedules.length === 0 ? (
        <EmptyState icon="calendar-remove" title="Không có ca" description="Không có định nghĩa ca nào đang hoạt động trong tuần này." />
      ) : (
        <>
          {/* Chọn ca */}
          <View>
            <Text variant="label" tone="muted" className="mb-1.5">CHỌN CA</Text>
            <View className="flex-row flex-wrap gap-2">
              {schedules.map((s) => (
                <ScheduleChip key={s.id} s={s} active={s.id === scheduleId} onPress={() => { haptics.selection(); setScheduleId(s.id); }} />
              ))}
            </View>
          </View>

          {/* Lọc theo thứ (tùy chọn) */}
          <View>
            <Text variant="label" tone="muted" className="mb-1.5">GIỚI HẠN THỨ (tùy chọn — bỏ trống = mọi ngày ca lặp lại)</Text>
            <View className="flex-row flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = (dayBits & d.bit) !== 0;
                return (
                  <Pressable
                    key={d.bit}
                    onPress={() => toggleDay(d.bit)}
                    className={cn('w-11 h-11 rounded-full items-center justify-center border', on ? 'bg-primary border-primary' : 'bg-surface dark:bg-surface-dark border-line/60 dark:border-line-dark')}
                  >
                    <Text variant="caption" className={cn('font-bold', on ? 'text-white' : 'text-muted')}>{d.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Chọn nhân viên */}
          <Card className="p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon name="account-multiple-check" size={18} tone="primary" />
              <Text variant="subtitle" className="flex-1">Nhân viên</Text>
              <Badge tone="info">{staffIds.size} đã chọn</Badge>
            </View>
            {(staffQ.data ?? []).map((u, i) => {
              const on = staffIds.has(u.id);
              return (
                <View key={u.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onPress={() => toggleStaff(u.id)} className="flex-row items-center gap-3 py-2.5">
                    <Avatar name={u.fullName} uri={staffAvatar(u)} size={36} />
                    <Text variant="bodySmall" className="flex-1 font-medium">{u.fullName}</Text>
                    <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} tone={on ? 'primary' : 'faint'} />
                  </Pressable>
                </View>
              );
            })}
          </Card>

          {/* Ghi đè */}
          <Card className="px-4">
            <ToggleRow
              icon="content-duplicate"
              title="Ghi đè phân công"
              description="Gỡ nhân viên không được chọn khỏi ca trong khoảng này."
              value={overwrite}
              onToggle={setOverwrite}
            />
          </Card>

          <Button fullWidth disabled={!canSubmit} loading={mutation.isPending} onPress={submit} icon="calendar-check">
            Phân công hàng loạt
          </Button>
        </>
      )}
    </Screen>
  );
}
