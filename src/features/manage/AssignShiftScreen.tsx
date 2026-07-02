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

import { useAllStaff, useApplyAutoAssign, useShiftSchedules, useStaffPunctuality } from './hooks';
import { buildAutoAssignProposal, type ProposalSlot } from './autoAssign';

dayjs.locale('vi');

// ----------------------------------------------------------------------
// Xếp ca tự động (Manager/Admin): chọn nhân viên → chỉ định / ngoại trừ theo
// ca (điểm chuyên cần tham gia xếp hạng) → Xem trước lịch tuần → Áp dụng.
// Thuật toán ở autoAssign.ts (rút gọn từ core-fe). Ca đã bắt đầu/checkin do
// BE chặn khi ghi.
// ----------------------------------------------------------------------

type CellState = 'none' | 'pin' | 'exclude';

// Ô trạng thái NV cho 1 template: none → pin (chỉ định) → exclude (ngoại trừ).
function StaffStateChip({ name, state, score, onPress }: { name: string; state: CellState; score: number; onPress: () => void }) {
  const cls =
    state === 'pin' ? 'bg-primary border-primary' :
    state === 'exclude' ? 'bg-error-soft border-error/40' :
    'bg-surface dark:bg-surface-dark border-line/60 dark:border-line-dark';
  const textCls = state === 'pin' ? 'text-white' : state === 'exclude' ? 'text-error' : 'text-muted';
  const icon = state === 'pin' ? 'star' : state === 'exclude' ? 'cancel' : null;
  return (
    <Pressable onPress={onPress} className={cn('flex-row items-center gap-1 px-2.5 py-1.5 rounded-full border', cls)}>
      {icon ? <Icon name={icon} size={12} color={state === 'pin' ? '#fff' : undefined} tone={state === 'exclude' ? 'error' : 'default'} /> : null}
      <Text variant="caption" className={cn('font-semibold', textCls)}>{name}</Text>
      {state === 'none' && score > 0 ? <Text variant="caption" tone="faint" className="text-[9px]">⚠{score}</Text> : null}
    </Pressable>
  );
}

export function AssignShiftScreen() {
  const [weekStart, setWeekStart] = useState(() => dayjs().startOf('week'));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [designation, setDesignation] = useState<Record<string, Set<string>>>({});
  const [exclusion, setExclusion] = useState<Record<string, Set<string>>>({});
  const [preview, setPreview] = useState<ProposalSlot[] | null>(null);
  const [expandedTpl, setExpandedTpl] = useState<string | null>(null);

  const fromDate = weekStart.format('YYYY-MM-DD');
  const toDate = weekStart.add(6, 'day').format('YYYY-MM-DD');
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  const schedulesQ = useShiftSchedules(fromDate, toDate);
  const staffQ = useAllStaff();
  const punctQ = useStaffPunctuality();
  const applyM = useApplyAutoAssign();

  const schedules = useMemo(
    () => (schedulesQ.data ?? []).filter((s) => s.isActive).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [schedulesQ.data]
  );
  // Template duy nhất (nhiều schedule có thể cùng template).
  const templates = useMemo(() => {
    const map = new Map<string, IShiftSchedule>();
    for (const s of schedules) if (!map.has(s.shiftTemplateId)) map.set(s.shiftTemplateId, s);
    return [...map.values()];
  }, [schedules]);

  const staff = staffQ.data ?? [];
  const staffById = useMemo(() => new Map(staff.map((u) => [u.id, u])), [staff]);
  const scoreOf = (id: string) => punctQ.data?.get(id) ?? 0;
  const avatarOf = (u: IUser) => getStorageUrl(u.avatarUrl || u.profileImageUrl) || null;

  function toggleSelect(id: string) {
    haptics.selection();
    setPreview(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else next.add(id);
      return next;
    });
  }

  // Xoay trạng thái NV cho 1 template: none → pin → exclude → none (loại trừ lẫn nhau).
  function cycleState(templateId: string, staffId: string) {
    haptics.selection();
    setPreview(null);
    const pinned = designation[templateId]?.has(staffId);
    const excluded = exclusion[templateId]?.has(staffId);
    const cur: CellState = pinned ? 'pin' : excluded ? 'exclude' : 'none';
    const next: CellState = cur === 'none' ? 'pin' : cur === 'pin' ? 'exclude' : 'none';

    setDesignation((d) => {
      const set = new Set(d[templateId] ?? []);
      if (next === 'pin') set.add(staffId); else set.delete(staffId);
      return { ...d, [templateId]: set };
    });
    setExclusion((e) => {
      const set = new Set(e[templateId] ?? []);
      if (next === 'exclude') set.add(staffId); else set.delete(staffId);
      return { ...e, [templateId]: set };
    });
  }
  const stateOf = (templateId: string, staffId: string): CellState =>
    designation[templateId]?.has(staffId) ? 'pin' : exclusion[templateId]?.has(staffId) ? 'exclude' : 'none';

  function generatePreview() {
    if (selected.size === 0) {
      toast.info('Chọn ít nhất 1 nhân viên để phân công.', 'Chưa đủ dữ liệu');
      return;
    }
    haptics.light();
    const slots = buildAutoAssignProposal({
      schedules,
      days,
      selectedIds: [...selected],
      designationByTemplate: designation,
      exclusionByTemplate: exclusion,
      scoreOf,
    });
    setPreview(slots);
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

  // Gom preview theo ngày để hiển thị lịch tuần.
  const previewByDay = useMemo(() => {
    if (!preview) return [];
    const byDay = new Map<string, ProposalSlot[]>();
    for (const s of preview) {
      if (!byDay.has(s.date)) byDay.set(s.date, []);
      byDay.get(s.date)!.push(s);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [preview]);

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
          {/* Chọn nhân viên */}
          <SectionCard title="Nhân viên tham gia" icon="account-multiple-plus" count={selected.size} bodyClassName="pt-0">
            {staff.map((u, i) => {
              const on = selected.has(u.id);
              const score = scoreOf(u.id);
              return (
                <View key={u.id}>
                  {i > 0 ? <Divider /> : null}
                  <Pressable onPress={() => toggleSelect(u.id)} className="flex-row items-center gap-3 py-2.5">
                    <Avatar name={u.fullName} uri={avatarOf(u)} size={34} />
                    <View className="flex-1">
                      <Text variant="bodySmall" className="font-medium">{u.fullName}</Text>
                      {score > 0 ? <Text variant="caption" tone="warning">⚠ {score} vi phạm/30 ngày</Text> : <Text variant="caption" tone="muted">Chuyên cần tốt</Text>}
                    </View>
                    <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} tone={on ? 'primary' : 'faint'} />
                  </Pressable>
                </View>
              );
            })}
          </SectionCard>

          {/* Chỉ định / ngoại trừ theo ca */}
          {selected.size > 0 ? (
            <SectionCard title="Chỉ định & ngoại trừ theo ca" icon="tune-vertical" bodyClassName="pt-0">
              <Text variant="caption" tone="muted" className="mb-2">
                Chạm tên để xoay: thường → <Text tone="primary" className="font-bold">chỉ định</Text> → <Text tone="error" className="font-bold">ngoại trừ</Text>.
              </Text>
              {templates.map((tpl, i) => {
                const open = expandedTpl === tpl.shiftTemplateId;
                const pins = designation[tpl.shiftTemplateId]?.size ?? 0;
                const excs = exclusion[tpl.shiftTemplateId]?.size ?? 0;
                return (
                  <View key={tpl.shiftTemplateId}>
                    {i > 0 ? <Divider /> : null}
                    <Pressable onPress={() => setExpandedTpl(open ? null : tpl.shiftTemplateId)} className="flex-row items-center gap-2 py-2.5">
                      <Icon name="clock-outline" size={16} tone="primary" />
                      <View className="flex-1">
                        <Text variant="bodySmall" className="font-medium">{tpl.templateName}</Text>
                        <Text variant="caption" tone="muted">{tpl.startTime}–{tpl.endTime}</Text>
                      </View>
                      {pins > 0 ? <Badge tone="primary">{pins} chỉ định</Badge> : null}
                      {excs > 0 ? <Badge tone="error">{excs} loại</Badge> : null}
                      <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} tone="muted" />
                    </Pressable>
                    {open ? (
                      <View className="flex-row flex-wrap gap-2 pb-3">
                        {[...selected].map((id) => {
                          const u = staffById.get(id);
                          if (!u) return null;
                          return (
                            <StaffStateChip
                              key={id}
                              name={u.fullName}
                              score={scoreOf(id)}
                              state={stateOf(tpl.shiftTemplateId, id)}
                              onPress={() => cycleState(tpl.shiftTemplateId, id)}
                            />
                          );
                        })}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </SectionCard>
          ) : null}

          <Button fullWidth variant="soft" icon="auto-fix" onPress={generatePreview}>Xem trước lịch tuần</Button>

          {/* Preview */}
          {preview ? (
            previewByDay.length === 0 ? (
              <EmptyState icon="calendar-question" title="Không có ca nào trong tuần" />
            ) : (
              <View className="gap-3">
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
    </Screen>
  );
}
