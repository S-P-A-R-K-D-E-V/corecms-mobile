import { useEffect, useMemo, useState } from 'react';
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
import type { IShiftSchedule } from 'src/types/corecms-api';

import { useAllStaff, useManageShiftAssignments, useShiftSchedules, useTeamAssignments } from './hooks';
import { DayStrip } from './DayStrip';
import { hasCheckin, hasShiftStarted, isScheduleOnDate } from './utils';

dayjs.locale('vi');

// ----------------------------------------------------------------------
// Xếp ca (Manager/Admin): chọn ngày → chọn ca → tick nhân viên → Lưu.
// Gửi manage-shift: danh sách tick trở thành tập phân công (BE tính thêm/gỡ).
// Luật ShiftMutationGuard phản chiếu lên UI: ca đã bắt đầu → Manager bị khoá
// toàn màn; nhân viên đã checkin → không gỡ được (trừ Admin).
// ----------------------------------------------------------------------

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
  const { user } = useAuthContext();
  const isAdmin = isAdminUser(user);

  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [selected, setSelected] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [scheduleId, setScheduleId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');

  const schedulesQ = useShiftSchedules(fromDate, toDate);
  const assignmentsQ = useTeamAssignments(fromDate, toDate);
  const staffQ = useAllStaff();
  const mutation = useManageShiftAssignments();

  // Ca áp dụng cho ngày đang chọn.
  const daySchedules = useMemo(
    () =>
      (schedulesQ.data ?? [])
        .filter((s) => s.isActive && isScheduleOnDate(s, dayjs(selected)))
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedulesQ.data, selected]
  );
  const schedule = daySchedules.find((s) => s.id === scheduleId) ?? null;

  // Phân công hiện tại của (ca, ngày) — nguồn khởi tạo danh sách tick.
  const currentAssignments = useMemo(
    () =>
      (assignmentsQ.data ?? []).filter(
        (a) => a.shiftScheduleId === scheduleId && dayjs(a.date).format('YYYY-MM-DD') === selected
      ),
    [assignmentsQ.data, scheduleId, selected]
  );
  const initialIds = useMemo(() => new Set(currentAssignments.map((a) => a.staffId)), [currentAssignments]);

  // Đổi ngày/ca → reset tick về hiện trạng server.
  useEffect(() => {
    setChecked(new Set(initialIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduleId, selected, assignmentsQ.dataUpdatedAt]);

  // Ngày đổi → nếu ca đang chọn không áp dụng cho ngày mới thì bỏ chọn.
  useEffect(() => {
    if (scheduleId && !daySchedules.some((s) => s.id === scheduleId)) setScheduleId(null);
  }, [selected, daySchedules, scheduleId]);

  // Khoá toàn màn khi ca đã bắt đầu (giờ VN) và không phải Admin.
  const shiftLocked =
    !!schedule && !isAdmin && hasShiftStarted({ date: selected, startTime: schedule.startTime });

  // Nhân viên đã checkin trong ca → không gỡ được (trừ Admin).
  const lockedStaffIds = useMemo(() => {
    if (isAdmin) return new Set<string>();
    return new Set(currentAssignments.filter((a) => hasCheckin(a)).map((a) => a.staffId));
  }, [currentAssignments, isAdmin]);

  const dirty =
    checked.size !== initialIds.size || [...checked].some((id) => !initialIds.has(id));

  function toggle(staffId: string) {
    if (shiftLocked) return;
    if (lockedStaffIds.has(staffId)) {
      toast.info('Nhân viên này đã checkin — chỉ Admin được gỡ.', 'Đã khoá');
      return;
    }
    haptics.selection();
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  }

  async function save() {
    if (!schedule) return;
    const added = [...checked].filter((id) => !initialIds.has(id)).length;
    const removed = [...initialIds].filter((id) => !checked.has(id)).length;
    const ok = await confirm({
      title: 'Lưu phân công',
      message: `Ca ${schedule.templateName} ngày ${dayjs(selected).format('DD/MM')}: thêm ${added}, gỡ ${removed} nhân viên?`,
      confirmText: 'Lưu',
    });
    if (!ok) return;
    try {
      const res = await mutation.mutateAsync({
        shiftScheduleId: schedule.id,
        date: selected,
        staffIds: [...checked],
      });
      haptics.success();
      toast.success(`Đã thêm ${res.added} · gỡ ${res.removed} nhân viên.`, 'Xếp ca thành công');
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Không lưu được');
    }
  }

  function shiftWeek(dir: -1 | 1) {
    haptics.light();
    const next = weekStart.add(dir, 'week');
    setWeekStart(next);
    setSelected(next.format('YYYY-MM-DD'));
  }

  const loading = schedulesQ.isLoading || assignmentsQ.isLoading || staffQ.isLoading;

  return (
    <Screen scroll tabBarInset={false} refreshing={assignmentsQ.isFetching} onRefresh={assignmentsQ.refetch}>
      <AppHeader title="Xếp ca" subtitle="Phân công nhân viên vào ca" back />

      <DayStrip weekStart={weekStart} selected={selected} onSelectDate={setSelected} onShiftWeek={shiftWeek} />

      {loading ? (
        <View className="gap-3">
          <Skeleton width="100%" height={54} radius={16} />
          <Skeleton width="100%" height={220} radius={16} />
        </View>
      ) : schedulesQ.isError || assignmentsQ.isError || staffQ.isError ? (
        <ErrorView onRetry={() => { schedulesQ.refetch(); assignmentsQ.refetch(); staffQ.refetch(); }} />
      ) : daySchedules.length === 0 ? (
        <EmptyState icon="calendar-remove" title="Không có ca" description={`Không có định nghĩa ca nào áp dụng cho ${dayjs(selected).format('DD/MM')}.`} />
      ) : (
        <>
          {/* Chọn ca */}
          <View className="flex-row flex-wrap gap-2">
            {daySchedules.map((s) => (
              <ScheduleChip key={s.id} s={s} active={s.id === scheduleId} onPress={() => { haptics.selection(); setScheduleId(s.id); }} />
            ))}
          </View>

          {!schedule ? (
            <EmptyState icon="gesture-tap" title="Chọn một ca" description="Chọn ca ở trên để phân công nhân viên." />
          ) : (
            <>
              {shiftLocked ? (
                <View className="flex-row items-center gap-2 px-3.5 py-2.5 rounded-xl bg-warning-soft">
                  <Icon name="lock-outline" size={16} tone="warning" />
                  <Text variant="bodySmall" tone="warning" className="font-semibold flex-1">
                    Ca đã bắt đầu — chỉ Admin được thay đổi phân công.
                  </Text>
                </View>
              ) : null}

              <Card className="p-4">
                <View className="flex-row items-center gap-2 mb-2">
                  <Icon name="account-multiple-check" size={18} tone="primary" />
                  <Text variant="subtitle" className="flex-1">Nhân viên</Text>
                  <Badge tone="info">{checked.size} đã chọn</Badge>
                </View>

                {(staffQ.data ?? []).map((u, i) => {
                  const on = checked.has(u.id);
                  const locked = lockedStaffIds.has(u.id);
                  return (
                    <View key={u.id}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable
                        onPress={() => toggle(u.id)}
                        disabled={shiftLocked}
                        className={cn('flex-row items-center gap-3 py-2.5', shiftLocked && 'opacity-50')}
                      >
                        <View className="w-8 h-8 rounded-full bg-primary-soft items-center justify-center">
                          <Text className="text-primary font-bold text-xs">
                            {(u.fullName ?? '?').trim().charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View className="flex-1">
                          <Text variant="bodySmall" className="font-medium">{u.fullName}</Text>
                          {locked ? (
                            <Text variant="caption" tone="warning">Đã checkin — chỉ Admin gỡ được</Text>
                          ) : null}
                        </View>
                        <Icon
                          name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={24}
                          tone={on ? 'primary' : 'faint'}
                        />
                      </Pressable>
                    </View>
                  );
                })}
              </Card>

              <Button
                fullWidth
                disabled={!dirty || shiftLocked}
                loading={mutation.isPending}
                onPress={save}
                icon="content-save-outline"
              >
                Lưu phân công
              </Button>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
