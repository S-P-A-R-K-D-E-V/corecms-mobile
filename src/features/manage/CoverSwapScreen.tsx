import { useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Pressable, Skeleton, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { useAuthContext } from 'src/auth/auth-context';
import { isAdminUser } from 'src/auth/roles';
import type { IShiftAssignment } from 'src/types/corecms-api';

import { useSwapShiftAssignments, useTeamAssignments } from './hooks';
import { DayStrip } from './DayStrip';
import { canMutateAssignment, mutationLockReason } from './utils';

dayjs.locale('vi');

// ----------------------------------------------------------------------
// Đổi ca hộ (Manager/Admin): chọn 2 phân công (có thể khác ngày — chuyển
// tuần/ngày thoải mái giữa 2 lần chọn) rồi hoán đổi. Ca đã bắt đầu / đã
// checkin bị khoá với Manager (Admin được — theo ShiftMutationGuard).
// ----------------------------------------------------------------------

function SlotSummary({
  label,
  slot,
  onClear,
}: {
  label: string;
  slot: IShiftAssignment | null;
  onClear: () => void;
}) {
  return (
    <View className={cn('flex-1 rounded-2xl border p-3 gap-0.5', slot ? 'border-primary/40 bg-primary-soft' : 'border-dashed border-line dark:border-line-dark')}>
      <View className="flex-row items-center justify-between">
        <Text variant="caption" tone={slot ? 'primary' : 'muted'} className="font-bold">{label}</Text>
        {slot ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Icon name="close-circle" size={16} tone="muted" />
          </Pressable>
        ) : null}
      </View>
      {slot ? (
        <>
          <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{slot.staffName}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {slot.shiftName} · {dayjs(slot.date).format('DD/MM')} · {slot.startTime}–{slot.endTime}
          </Text>
        </>
      ) : (
        <Text variant="caption" tone="faint">Chạm một ca bên dưới</Text>
      )}
    </View>
  );
}

export function CoverSwapScreen() {
  const { user } = useAuthContext();
  const isAdmin = isAdminUser(user);

  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [selected, setSelected] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [slotA, setSlotA] = useState<IShiftAssignment | null>(null);
  const [slotB, setSlotB] = useState<IShiftAssignment | null>(null);

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const { data, isLoading, isError, refetch, isFetching } = useTeamAssignments(fromDate, toDate);
  const mutation = useSwapShiftAssignments();

  const { countByDate, dayItems } = useMemo(() => {
    const counts: Record<string, number> = {};
    const items: IShiftAssignment[] = [];
    for (const a of data ?? []) {
      const iso = dayjs(a.date).format('YYYY-MM-DD');
      counts[iso] = (counts[iso] ?? 0) + 1;
      if (iso === selected) items.push(a);
    }
    items.sort((x, y) => x.startTime.localeCompare(y.startTime) || x.staffName.localeCompare(y.staffName));
    return { countByDate: counts, dayItems: items };
  }, [data, selected]);

  function pick(a: IShiftAssignment) {
    // Bỏ chọn nếu chạm lại chính nó.
    if (slotA?.id === a.id) { setSlotA(null); return; }
    if (slotB?.id === a.id) { setSlotB(null); return; }

    if (!a.shiftScheduleId) {
      toast.info('Ca thuộc hệ cũ, không hỗ trợ đổi.', 'Không thể chọn');
      return;
    }
    const reason = mutationLockReason(a, isAdmin);
    if (reason) {
      toast.info(reason, 'Không thể chọn');
      return;
    }
    haptics.selection();
    if (!slotA) setSlotA(a);
    else if (!slotB) {
      if (a.staffId === slotA.staffId && a.shiftScheduleId === slotA.shiftScheduleId && a.date === slotA.date) return;
      setSlotB(a);
    } else {
      // Cả 2 đã chọn → thay ca thứ hai.
      setSlotB(a);
    }
  }

  const sameStaff = !!slotA && !!slotB && slotA.staffId === slotB.staffId;
  const canSwap = !!slotA && !!slotB && !sameStaff;

  async function doSwap() {
    if (!slotA || !slotB || !slotA.shiftScheduleId || !slotB.shiftScheduleId) return;
    const ok = await confirm({
      title: 'Đổi ca hộ',
      message:
        `Hoán đổi:\n` +
        `• ${slotA.staffName} — ${slotA.shiftName} ${dayjs(slotA.date).format('DD/MM')}\n` +
        `• ${slotB.staffName} — ${slotB.shiftName} ${dayjs(slotB.date).format('DD/MM')}?`,
      confirmText: 'Đổi ca',
    });
    if (!ok) return;
    try {
      await mutation.mutateAsync({
        staffId1: slotA.staffId,
        shiftScheduleId1: slotA.shiftScheduleId,
        date1: dayjs(slotA.date).format('YYYY-MM-DD'),
        staffId2: slotB.staffId,
        shiftScheduleId2: slotB.shiftScheduleId,
        date2: dayjs(slotB.date).format('YYYY-MM-DD'),
      });
      haptics.success();
      toast.success('Đã hoán đổi 2 ca thành công.', 'Đổi ca hộ');
      setSlotA(null);
      setSlotB(null);
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Không đổi được');
    }
  }

  function shiftWeek(dir: -1 | 1) {
    haptics.light();
    const next = weekStart.add(dir, 'week');
    setWeekStart(next);
    setSelected(next.format('YYYY-MM-DD'));
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Đổi ca hộ" subtitle="Hoán đổi ca giữa 2 nhân viên" back />

      {/* 2 slot đã chọn — giữ nguyên khi chuyển ngày/tuần */}
      <View className="flex-row gap-2.5 items-stretch">
        <SlotSummary label="CA 1" slot={slotA} onClear={() => setSlotA(null)} />
        <View className="self-center">
          <Icon name="swap-horizontal" size={22} tone={canSwap ? 'primary' : 'faint'} />
        </View>
        <SlotSummary label="CA 2" slot={slotB} onClear={() => setSlotB(null)} />
      </View>
      {sameStaff ? (
        <Text variant="caption" tone="warning" className="text-center">
          Hai ca phải thuộc 2 nhân viên khác nhau.
        </Text>
      ) : null}

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
            </Card>
          ))}
        </View>
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : dayItems.length === 0 ? (
        <EmptyState icon="calendar-blank-outline" title="Không có ca nào" description={`Không có phân công ngày ${dayjs(selected).format('DD/MM')}.`} />
      ) : (
        <Card className="p-4">
          {dayItems.map((a, i) => {
            const picked = slotA?.id === a.id ? 1 : slotB?.id === a.id ? 2 : 0;
            const lockReason = mutationLockReason(a, isAdmin);
            const selectable = !!a.shiftScheduleId && !lockReason;
            return (
              <View key={a.id}>
                {i > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => pick(a)}
                  className={cn('flex-row items-center gap-3 py-2.5', !selectable && 'opacity-45')}
                >
                  <View className={cn('w-8 h-8 rounded-full items-center justify-center', picked ? 'bg-primary' : 'bg-primary-soft')}>
                    {picked ? (
                      <Text className="text-white font-bold text-xs">{picked}</Text>
                    ) : (
                      <Text className="text-primary font-bold text-xs">
                        {(a.staffName ?? '?').trim().charAt(0).toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View className="flex-1">
                    <Text variant="bodySmall" className="font-medium">{a.staffName}</Text>
                    <Text variant="caption" tone="muted">
                      {a.shiftName} · {a.startTime}–{a.endTime}
                    </Text>
                    {lockReason ? (
                      <Text variant="caption" tone="warning">{lockReason}</Text>
                    ) : null}
                  </View>
                  {picked ? <Badge tone="success">Đã chọn</Badge> : null}
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      <Button fullWidth disabled={!canSwap} loading={mutation.isPending} onPress={doSwap} icon="swap-horizontal">
        Hoán đổi 2 ca
      </Button>
    </Screen>
  );
}
