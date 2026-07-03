import { useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

import { Screen, AppHeader, EmptyState, ErrorView, SectionCard } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Pressable, Skeleton, Divider, Avatar, Chip } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { getStorageUrl } from 'src/api/axios';
import type { IShiftSchedule, IUser } from 'src/types/corecms-api';

import {
  useAllStaff, useApplyAutoAssign, useShiftSchedules, useStaffPunctuality,
  useShiftRegistrations, useSetSchedulingPriority,
} from './hooks';
import { buildAutoAssignProposal, slotKeyOf, type ProposalSlot } from './autoAssign';
import { SlotDesignationSheet } from './SlotDesignationSheet';
import { isScheduleOnDate } from './utils';

dayjs.locale('vi');

// ----------------------------------------------------------------------
// Xếp ca tự động (Manager/Admin) — luồng khớp core-fe:
//   1) Chọn nhân viên tham gia; mỗi NV có ⭐ ưu tiên (tăng/giảm) + "khóa ca"
//      (chỉ xếp ca họ đã đăng ký).
//   2) Chạm từng ca trong tuần → chỉ định / ngoại trừ nhân viên cho ca đó.
//   3) "Phân công tự động" → xem trước lịch tuần + biểu đồ phân bổ ca → Áp dụng.
// ----------------------------------------------------------------------

type SlotRef = { key: string; scheduleId: string; date: string; label: string; subtitle: string };

/** Biểu đồ phân bổ: mỗi NV bao nhiêu ca trong đề xuất (thanh ngang). */
function DistributionBars({ counts }: { counts: { name: string; count: number }[] }) {
  const max = Math.max(1, ...counts.map((c) => c.count));
  if (counts.length === 0) return null;
  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center gap-2 mb-1">
        <Icon name="chart-bar" size={18} tone="primary" />
        <Text variant="subtitle" className="flex-1">Phân bổ ca / nhân viên</Text>
      </View>
      {counts.map((c) => (
        <View key={c.name} className="flex-row items-center gap-2">
          <Text variant="caption" tone="muted" className="w-24" numberOfLines={1}>{c.name}</Text>
          <View className="flex-1 h-3 rounded-full bg-ink/5 dark:bg-white/10 overflow-hidden">
            <View className="h-3 rounded-full bg-primary" style={{ width: `${(c.count / max) * 100}%` }} />
          </View>
          <Text variant="caption" className="w-6 text-right font-semibold" style={{ fontVariant: ['tabular-nums'] }}>{c.count}</Text>
        </View>
      ))}
    </Card>
  );
}

export function AssignShiftScreen() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyRegistered, setOnlyRegistered] = useState<Set<string>>(new Set());
  const [priorityOverride, setPriorityOverride] = useState<Record<string, number>>({});
  const [designationMap, setDesignationMap] = useState<Record<string, string[]>>({});
  const [exclusionMap, setExclusionMap] = useState<Record<string, string[]>>({});
  const [preview, setPreview] = useState<ProposalSlot[] | null>(null);
  const [slotSheet, setSlotSheet] = useState<SlotRef | null>(null);

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  const schedulesQ = useShiftSchedules(fromDate, toDate);
  const staffQ = useAllStaff();
  const punctQ = useStaffPunctuality();
  const regsQ = useShiftRegistrations(fromDate, toDate);
  const setPriorityM = useSetSchedulingPriority();
  const applyM = useApplyAutoAssign();

  const schedules = useMemo(
    () => (schedulesQ.data ?? []).filter((s) => s.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedulesQ.data]
  );

  const staff = staffQ.data ?? [];
  const staffById = useMemo(() => new Map(staff.map((u) => [u.id, u])), [staff]);
  const punctOf = (id: string) => punctQ.data?.get(id) ?? 0;
  const priorityOf = (id: string) => priorityOverride[id] ?? staffById.get(id)?.schedulingPriority ?? 0;
  const avatarOf = (u: IUser) => getStorageUrl(u.avatarUrl || u.profileImageUrl) || null;

  // registrationMap: slotKey → set staffId đã đăng ký ca đó.
  const registrationMap = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const r of regsQ.data ?? []) {
      const key = slotKeyOf(r.shiftScheduleId, r.date.split('T')[0]);
      if (!m.has(key)) m.set(key, new Set());
      m.get(key)!.add(r.staffId);
    }
    return m;
  }, [regsQ.data]);

  // Các slot trong tuần (theo ngày → ca).
  const weekSlots = useMemo(() => {
    const byDay: { day: dayjs.Dayjs; slots: { schedule: IShiftSchedule; key: string; date: string }[] }[] = [];
    for (const day of days) {
      const date = day.format('YYYY-MM-DD');
      const slots = schedules
        .filter((s) => isScheduleOnDate(s, day))
        .map((s) => ({ schedule: s, key: slotKeyOf(s.id, date), date }));
      if (slots.length > 0) byDay.push({ day, slots });
    }
    return byDay;
  }, [days, schedules]);

  function toggleSelect(id: string) {
    haptics.selection();
    setPreview(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleOnlyRegistered(id: string) {
    haptics.selection();
    setPreview(null);
    setOnlyRegistered((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function adjustPriority(id: string, delta: number) {
    haptics.light();
    setPreview(null);
    const next = Math.max(0, priorityOf(id) + delta);
    setPriorityOverride((p) => ({ ...p, [id]: next }));
    try {
      await setPriorityM.mutateAsync({ userId: id, priority: next });
    } catch (e) {
      toast.error(extractApiError(e), 'Không lưu được ưu tiên');
    }
  }

  // Xoay trạng thái NV cho 1 slot: none → chỉ định → ngoại trừ → none.
  function cycleSlotState(slotKey: string, staffId: string) {
    setPreview(null);
    const pinned = designationMap[slotKey]?.includes(staffId);
    const excluded = exclusionMap[slotKey]?.includes(staffId);
    const next = pinned ? 'exclude' : excluded ? 'none' : 'designate';

    setDesignationMap((d) => {
      const arr = new Set(d[slotKey] ?? []);
      if (next === 'designate') arr.add(staffId); else arr.delete(staffId);
      return { ...d, [slotKey]: [...arr] };
    });
    setExclusionMap((e) => {
      const arr = new Set(e[slotKey] ?? []);
      if (next === 'exclude') arr.add(staffId); else arr.delete(staffId);
      return { ...e, [slotKey]: [...arr] };
    });
  }

  const hasAnyDesignation = useMemo(
    () => Object.values(designationMap).some((a) => a.length > 0),
    [designationMap]
  );

  function generatePreview() {
    if (selected.size === 0 && !hasAnyDesignation) {
      toast.info('Chọn nhân viên hoặc chỉ định NV cho ca trước khi phân công.', 'Chưa đủ dữ liệu');
      return;
    }
    haptics.light();
    setPreview(buildAutoAssignProposal({
      schedules, days,
      selectedIds: [...selected],
      onlyRegisteredIds: onlyRegistered,
      designationMap, exclusionMap, registrationMap,
      priorityOf, punctOf,
    }));
  }

  async function apply() {
    if (!preview) return;
    const nonEmpty = preview.filter((s) => s.proposedStaffIds.length > 0);
    if (nonEmpty.length === 0) {
      toast.info('Không có ca nào được đề xuất.', 'Trống');
      return;
    }
    const ok = await confirm({
      title: 'Áp dụng phân công',
      message: `Ghi ${nonEmpty.length} ca (tuần ${weekStart.format('DD/MM')} – ${weekStart.add(6, 'day').format('DD/MM')}) vào lịch?`,
      confirmText: 'Áp dụng',
    });
    if (!ok) return;
    try {
      const res = await applyM.mutateAsync(
        nonEmpty.map((s) => ({ scheduleId: s.scheduleId, date: s.date, staffIds: s.proposedStaffIds }))
      );
      haptics.success();
      toast.success(`Đã thêm ${res.added} · gỡ ${res.removed} phân công.`, 'Phân công thành công');
      setPreview(null);
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Không áp dụng được');
    }
  }

  function shiftWeek(dir: -1 | 1) {
    haptics.light();
    setWeekStart((w) => w.add(dir, 'week'));
    setPreview(null);
  }

  const loading = schedulesQ.isLoading || staffQ.isLoading;

  const previewByDay = useMemo(() => {
    if (!preview) return [];
    const byDay = new Map<string, ProposalSlot[]>();
    for (const s of preview) {
      if (!byDay.has(s.date)) byDay.set(s.date, []);
      byDay.get(s.date)!.push(s);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [preview]);

  const distribution = useMemo(() => {
    if (!preview) return [];
    const count = new Map<string, number>();
    for (const s of preview) for (const id of s.proposedStaffIds) count.set(id, (count.get(id) ?? 0) + 1);
    return [...count.entries()]
      .map(([id, c]) => ({ name: staffById.get(id)?.fullName ?? id, count: c }))
      .sort((a, b) => b.count - a.count);
  }, [preview, staffById]);

  const selectedStaffList = useMemo(
    () => [...selected].map((id) => ({ id, name: staffById.get(id)?.fullName ?? id })),
    [selected, staffById]
  );

  return (
    <Screen scroll tabBarInset={false} refreshing={schedulesQ.isFetching} onRefresh={schedulesQ.refetch}>
      <AppHeader title="Xếp ca tự động" subtitle="Gợi ý phân công theo tuần" back />

      {/* Tuần */}
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
        <View className="gap-3"><Skeleton width="100%" height={120} radius={16} /><Skeleton width="100%" height={200} radius={16} /></View>
      ) : schedulesQ.isError || staffQ.isError ? (
        <ErrorView onRetry={() => { schedulesQ.refetch(); staffQ.refetch(); }} />
      ) : schedules.length === 0 ? (
        <EmptyState icon="calendar-remove" title="Không có ca" description="Tuần này chưa có định nghĩa ca nào." />
      ) : (
        <>
          {/* Chọn nhân viên + ưu tiên + khóa ca */}
          <SectionCard title="Nhân viên tham gia" icon="account-multiple-plus" count={selected.size} bodyClassName="pt-0">
            {staff.map((u, i) => {
              const on = selected.has(u.id);
              const locked = onlyRegistered.has(u.id);
              const prio = priorityOf(u.id);
              const score = punctOf(u.id);
              return (
                <View key={u.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onPress={() => toggleSelect(u.id)} className="flex-row items-center gap-3 py-2.5">
                    <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} tone={on ? 'primary' : 'faint'} />
                    <Avatar name={u.fullName} uri={avatarOf(u)} size={34} />
                    <View className="flex-1 gap-1">
                      <View className="flex-row items-center gap-1.5">
                        <Text variant="bodySmall" className="font-medium flex-1" numberOfLines={1}>{u.fullName}</Text>
                        {prio > 0 ? <Badge tone="warning">⭐ {prio}</Badge> : null}
                      </View>
                      {score > 0 ? <Text variant="caption" tone="warning">⚠ {score} vi phạm/30 ngày</Text> : <Text variant="caption" tone="muted">Chuyên cần tốt</Text>}
                      {on ? (
                        <View className="flex-row items-center gap-2 mt-1">
                          {/* Ưu tiên ⭐ */}
                          <View className="flex-row items-center rounded-full bg-ink/5 dark:bg-white/10">
                            <Pressable onPress={() => adjustPriority(u.id, -1)} hitSlop={6} className="w-7 h-7 items-center justify-center">
                              <Icon name="minus" size={14} tone={prio > 0 ? 'default' : 'faint'} />
                            </Pressable>
                            <Text variant="caption" className="font-bold px-0.5" style={{ fontVariant: ['tabular-nums'] }}>⭐ {prio}</Text>
                            <Pressable onPress={() => adjustPriority(u.id, 1)} hitSlop={6} className="w-7 h-7 items-center justify-center">
                              <Icon name="plus" size={14} tone="primary" />
                            </Pressable>
                          </View>
                          {/* Khóa ca */}
                          <Pressable
                            onPress={() => toggleOnlyRegistered(u.id)}
                            className={cn('flex-row items-center gap-1 px-2.5 py-1.5 rounded-full border', locked ? 'bg-primary-soft border-primary/40' : 'border-line/60 dark:border-line-dark')}
                          >
                            <Icon name={locked ? 'lock' : 'lock-open-variant-outline'} size={13} tone={locked ? 'primary' : 'muted'} />
                            <Text variant="caption" className={cn('font-semibold', locked ? 'text-primary' : 'text-muted')}>Khóa ca</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                </View>
              );
            })}
            <Text variant="caption" tone="muted" className="mt-1">
              ⭐ ưu tiên cao được xếp trước · "Khóa ca" = chỉ xếp ca nhân viên đã đăng ký.
            </Text>
          </SectionCard>

          {/* Chỉ định / ngoại trừ theo TỪNG ca */}
          {selected.size > 0 ? (
            <SectionCard title="Chỉ định & ngoại trừ theo ca" icon="tune-vertical" bodyClassName="pt-0">
              <Text variant="caption" tone="muted" className="mb-1">Chạm 1 ca để chỉ định (luôn xếp) hoặc ngoại trừ nhân viên.</Text>
              {weekSlots.map(({ day, slots }, di) => (
                <View key={day.format('YYYY-MM-DD')}>
                  {di > 0 ? <Divider className="my-1" /> : null}
                  <Text variant="label" tone="muted" className="capitalize mt-1 mb-0.5">{day.format('dddd DD/MM')}</Text>
                  {slots.map(({ schedule, key, date }) => {
                    const pins = designationMap[key]?.length ?? 0;
                    const excs = exclusionMap[key]?.length ?? 0;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => setSlotSheet({
                          key, scheduleId: schedule.id, date,
                          label: `${schedule.templateName}`,
                          subtitle: `${day.format('dddd DD/MM')} · ${schedule.startTime}–${schedule.endTime}`,
                        })}
                        className="flex-row items-center gap-2 py-2"
                      >
                        <Icon name="clock-outline" size={15} tone="primary" />
                        <Text variant="bodySmall" className="flex-1" numberOfLines={1}>{schedule.templateName} · {schedule.startTime}–{schedule.endTime}</Text>
                        {pins > 0 ? <Badge tone="primary">{pins} chỉ định</Badge> : null}
                        {excs > 0 ? <Badge tone="error">{excs} loại</Badge> : null}
                        <Icon name="chevron-right" size={16} tone="faint" />
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </SectionCard>
          ) : null}

          <Button fullWidth variant="soft" icon="auto-fix" onPress={generatePreview}>Phân công tự động</Button>

          {/* Preview + biểu đồ */}
          {preview ? (
            previewByDay.length === 0 ? (
              <EmptyState icon="calendar-question" title="Không có ca nào trong tuần" />
            ) : (
              <View className="gap-3">
                <DistributionBars counts={distribution} />
                <Text variant="label" tone="muted">XEM TRƯỚC — {weekStart.format('DD/MM')} → {weekStart.add(6, 'day').format('DD/MM')}</Text>
                {previewByDay.map(([date, slots]) => (
                  <Card key={date} className="p-4 gap-2">
                    <Text variant="subtitle" className="capitalize">{dayjs(date).format('dddd DD/MM')}</Text>
                    {slots.map((s) => (
                      <View key={s.scheduleId} className="flex-row items-start gap-2">
                        <Text variant="caption" tone="muted" className="w-24">{s.startTime}–{s.endTime}</Text>
                        <View className="flex-1 flex-row flex-wrap gap-1.5">
                          {s.proposedStaffIds.length === 0 ? (
                            <Text variant="caption" tone="faint">— chưa có người</Text>
                          ) : (
                            s.proposedStaffIds.map((id) => (
                              <Chip key={id} label={staffById.get(id)?.fullName ?? id} />
                            ))
                          )}
                        </View>
                      </View>
                    ))}
                  </Card>
                ))}
                <Button fullWidth icon="calendar-check" loading={applyM.isPending} onPress={apply}>Áp dụng phân công</Button>
              </View>
            )
          ) : null}
        </>
      )}

      {slotSheet ? (
        <SlotDesignationSheet
          visible={!!slotSheet}
          onClose={() => setSlotSheet(null)}
          title={slotSheet.label}
          subtitle={slotSheet.subtitle}
          staff={selectedStaffList}
          designated={new Set(designationMap[slotSheet.key] ?? [])}
          excluded={new Set(exclusionMap[slotSheet.key] ?? [])}
          registeredSet={registrationMap.get(slotSheet.key) ?? new Set()}
          onCycle={(staffId) => cycleSlotState(slotSheet.key, staffId)}
        />
      ) : null}
    </Screen>
  );
}
