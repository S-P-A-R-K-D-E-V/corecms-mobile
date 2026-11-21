import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { EmptyState, ErrorView, SectionCard, Sheet, ToggleRow } from 'src/components/shared';
import { Badge, Button, Chip, Skeleton, Text, TextField, TimeField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { createCleaningSeries } from 'src/api/cleaning';
import { assignWorkTask, getWorkTasks } from 'src/api/hr';
import { WORK_TASK_STATUS_LABEL, type IWorkTask, type WorkTaskStatus } from 'src/types/hr';
import type { CleaningShiftBlock } from 'src/types/corecms-api';

import { ReassignSheet } from './ReassignSheet';
import {
  BLOCKS,
  BLOCK_LABEL,
  GROUP_SUGGESTIONS,
  buildPersonAssignBody,
  buildShiftAssignBody,
  canReassign,
  isRecurringTask,
  openAssignedTasks,
  type PersonAssignForm,
  type ShiftAssignForm,
} from './schedule';
import { TASK_REVIEW_PATH } from './work-center';
import { DateStepper, GroupChips, StaffChips } from './work-center-ui';
import { taskSubtitle } from 'src/features/work/work-task-review';

// ----------------------------------------------------------------------
// Giao việc: "Cả ca" (một ngày + ca, ai trong ca làm cũng được → POST cleaning/series một ô, fromDate = toDate) và "Một người"
// (POST work-tasks). Dưới là việc giao còn mở (Chờ chấm / Trả lại / Đã giao) — Đổi người với việc Đã giao / Trả lại, Chấm với
// việc đã nộp (mở màn Chấm việc giao).
// ----------------------------------------------------------------------

const OPEN_STATUSES: WorkTaskStatus[] = ['Submitted', 'Rejected', 'Assigned'];

const STATUS_TONE: Record<WorkTaskStatus, 'info' | 'warning' | 'success' | 'error' | 'neutral'> = {
  Assigned: 'info',
  Submitted: 'warning',
  Approved: 'success',
  Rejected: 'error',
  Cancelled: 'neutral',
};

/** Ca hiện tại theo giờ máy: trước 12:30 sáng, trước 18:00 chiều, còn lại tối (chỉ để chọn sẵn). */
function currentBlock(): CleaningShiftBlock {
  const m = dayjs().hour() * 60 + dayjs().minute();
  return m < 12 * 60 + 30 ? 'Morning' : m < 18 * 60 ? 'Afternoon' : 'Evening';
}

function ShiftAssignSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');
  const blank = (): ShiftAssignForm => ({ date: today, block: currentBlock(), name: '', area: '', group: GROUP_SUGGESTIONS[0], requiresPhoto: true });
  const [form, setForm] = useState<ShiftAssignForm>(blank);
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<ShiftAssignForm>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (visible) setForm(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function save() {
    const built = buildShiftAssignBody(form, today);
    if (!built.ok) {
      toast.warning(built.error);
      return;
    }
    setBusy(true);
    try {
      await createCleaningSeries(built.body);
      toast.success(`Đã giao cho ca ${BLOCK_LABEL[form.block].toLowerCase()} ${dayjs(form.date).format('DD/MM')}`);
      qc.invalidateQueries({ queryKey: ['work-center'] });
      onClose();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa giao được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Giao việc cho cả ca"
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} onPress={save}>
          Giao việc
        </Button>
      }
    >
      <View className="gap-3">
        <DateStepper label="Ngày" value={form.date} min={today} onChange={(date) => patch({ date })} />
        <View className="gap-1.5">
          <Text variant="caption" tone="muted" className="font-semibold">
            Ca
          </Text>
          <View className="flex-row gap-2">
            {BLOCKS.map((b) => (
              <Chip key={b} label={BLOCK_LABEL[b]} size="sm" color="primary" selected={form.block === b} onPress={() => patch({ block: b })} />
            ))}
          </View>
        </View>
        <TextField label="Tên việc" value={form.name} onChangeText={(name) => patch({ name })} placeholder="VD: Lau kính tủ trưng bày" />
        <TextField label="Khu (tuỳ chọn)" value={form.area} onChangeText={(area) => patch({ area })} />
        <View className="gap-1.5">
          <Text variant="caption" tone="muted" className="font-semibold">
            Nhóm
          </Text>
          <GroupChips value={form.group} onChange={(group) => patch({ group })} />
        </View>
        <ToggleRow
          icon="camera-outline"
          title="Cần ảnh khi xong"
          description={form.requiresPhoto ? 'Người làm chụp ảnh, quản lý chấm' : 'Chỉ tick "Đã làm"'}
          value={form.requiresPhoto}
          onToggle={(requiresPhoto) => patch({ requiresPhoto })}
        />
        <Text variant="caption" tone="faint">
          Ai trong ca đó làm cũng được; việc hiện ở "Việc của tôi" của người trong ca.
        </Text>
      </View>
    </Sheet>
  );
}

function PersonAssignSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const today = dayjs().format('YYYY-MM-DD');
  const blank = (): PersonAssignForm => ({ assigneeId: null, title: '', description: '', dueDate: today, dueTime: '' });
  const [form, setForm] = useState<PersonAssignForm>(blank);
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<PersonAssignForm>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (visible) setForm(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function save() {
    const built = buildPersonAssignBody(form, Date.now());
    if (!built.ok) {
      toast.warning(built.error);
      return;
    }
    setBusy(true);
    try {
      await assignWorkTask(built.body);
      toast.success('Đã giao việc — người được giao đã được báo');
      qc.invalidateQueries({ queryKey: ['work-center'] });
      qc.invalidateQueries({ queryKey: ['work-task-review'] });
      onClose();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa giao được');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Giao việc cho một người"
      onClose={busy ? () => {} : onClose}
      footer={
        <Button loading={busy} onPress={save}>
          Giao việc
        </Button>
      }
    >
      <View className="gap-3">
        <StaffChips label="Người làm" value={form.assigneeId} onChange={(assigneeId) => patch({ assigneeId })} />
        <TextField label="Tên việc" value={form.title} onChangeText={(title) => patch({ title })} placeholder="VD: Chụp ảnh 7 món mới" />
        <TextField
          label="Mô tả (tuỳ chọn)"
          value={form.description}
          onChangeText={(description) => patch({ description })}
          multiline
          numberOfLines={3}
        />
        {form.dueDate ? (
          <View className="gap-2">
            <DateStepper label="Hạn" value={form.dueDate} min={today} onChange={(dueDate) => patch({ dueDate })} />
            <TimeField label="Giờ hạn (trống = 23:59)" value={form.dueTime} onChangeTime={(dueTime) => patch({ dueTime })} placeholder="17:30" />
            <Button size="sm" variant="ghost" onPress={() => patch({ dueDate: null })}>
              Không đặt hạn
            </Button>
          </View>
        ) : (
          <Button size="sm" variant="outline" icon="calendar-clock" onPress={() => patch({ dueDate: today })}>
            Đặt hạn
          </Button>
        )}
        <Text variant="caption" tone="faint">
          Người được giao nộp kèm ảnh; trễ hạn không ghi lý do hoặc bị trả lại lần 2 thì tính vi phạm theo quy chế.
        </Text>
      </View>
    </Sheet>
  );
}

function OpenTaskCard({ task, onReassign }: { task: IWorkTask; onReassign: () => void }) {
  return (
    <View className="py-2.5 gap-1.5">
      <View className="flex-row items-center gap-2">
        <Text variant="body" className="font-semibold flex-1" numberOfLines={2}>
          {task.title}
        </Text>
        <Badge tone={STATUS_TONE[task.status]}>{WORK_TASK_STATUS_LABEL[task.status]}</Badge>
      </View>
      <View className="flex-row flex-wrap items-center gap-1.5">
        {isRecurringTask(task) ? <Badge tone="secondary">Lặp</Badge> : null}
        <Text variant="caption" tone={task.late ? 'error' : 'muted'} className="flex-1" numberOfLines={1}>
          {taskSubtitle(task) || '—'}
        </Text>
      </View>
      <View className="flex-row gap-2">
        {canReassign(task) ? (
          <Button size="sm" variant="outline" icon="account-switch-outline" onPress={onReassign}>
            Đổi người
          </Button>
        ) : null}
        {task.status === 'Submitted' ? (
          <Button
            size="sm"
            icon="clipboard-check-outline"
            onPress={() => router.push({ pathname: TASK_REVIEW_PATH, params: { id: task.id } } as any)}
          >
            Chấm
          </Button>
        ) : null}
      </View>
    </View>
  );
}

export function AssignTab({ canAssignShift, canAssignPerson }: { canAssignShift: boolean; canAssignPerson: boolean }) {
  const [sheet, setSheet] = useState<'shift' | 'person' | null>(null);
  const [reassign, setReassign] = useState<IWorkTask | null>(null);

  const open = useQuery({
    queryKey: ['work-center', 'open-tasks'],
    queryFn: async () => {
      const lists = await Promise.all(OPEN_STATUSES.map((status) => getWorkTasks({ status })));
      return openAssignedTasks(lists.flat());
    },
    enabled: canAssignPerson,
  });

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        {canAssignShift ? (
          <View className="flex-1">
            <Button icon="account-group-outline" onPress={() => setSheet('shift')}>
              Cả ca
            </Button>
          </View>
        ) : null}
        {canAssignPerson ? (
          <View className="flex-1">
            <Button icon="account-outline" variant={canAssignShift ? 'outline' : 'solid'} onPress={() => setSheet('person')}>
              Một người
            </Button>
          </View>
        ) : null}
      </View>
      <Text variant="caption" tone="faint">
        Việc lặp hằng tuần khai ở tab Lịch tuần. Việc giao cả ca hiện trên Bảng việc theo ca (VS-).
      </Text>

      {canAssignPerson ? (
        open.isLoading ? (
          <Skeleton width="100%" height={140} radius={16} />
        ) : open.isError ? (
          <ErrorView message={`Không tải được việc giao: ${extractApiError(open.error)}`} onRetry={open.refetch} />
        ) : (open.data ?? []).length === 0 ? (
          <EmptyState icon="clipboard-check-outline" title="Không có việc giao nào đang mở" />
        ) : (
          <SectionCard title="Việc giao đang mở" icon="clipboard-account-outline" count={open.data!.length} bodyClassName="pt-0">
            {open.data!.map((t, i) => (
              <View key={t.id}>
                {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50" /> : null}
                <OpenTaskCard task={t} onReassign={() => setReassign(t)} />
              </View>
            ))}
          </SectionCard>
        )
      ) : null}
      {canAssignPerson ? (
        <Button variant="ghost" icon="history" onPress={() => router.push(TASK_REVIEW_PATH as any)}>
          Chấm việc giao · xem theo tháng
        </Button>
      ) : null}

      <ShiftAssignSheet visible={sheet === 'shift'} onClose={() => setSheet(null)} />
      <PersonAssignSheet visible={sheet === 'person'} onClose={() => setSheet(null)} />
      <ReassignSheet task={reassign} onClose={() => setReassign(null)} />
    </View>
  );
}
