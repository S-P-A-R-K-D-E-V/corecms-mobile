import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, Sheet, EmptyState } from 'src/components/shared';
import { Text, Button, Badge, TextField, Icon, Pressable, SegmentedControl, Skeleton } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getWorkTask, getWorkTasks, reviewWorkTask } from 'src/api/hr';
import { WORK_TASK_STATUS_LABEL, type IWorkTask, type WorkTaskStatus } from 'src/types/hr';
import { PhotoStrip } from 'src/features/inspection/inspection-ui';

import { REVIEW_TABS, inTab, reviewNoteError, tabForStatus, taskSubtitle, type ReviewTab } from './work-task-review';

// ----------------------------------------------------------------------
// Chấm việc giao riêng (Việc được giao → Cho một người) trên app: xem việc của mọi người, ảnh nghiệm thu, ghi chú khi nộp,
// lý do trễ; việc đã nộp thì Đạt hoặc Trả lại (bắt buộc lý do). Giao và huỷ việc vẫn ở web. Mở với ?id= (thẻ "Việc giao hôm
// nay", thông báo) thì nhảy tới tab và tháng của việc đó, việc đó lên đầu.
// ----------------------------------------------------------------------

const STATUS_TONE: Record<WorkTaskStatus, 'info' | 'warning' | 'success' | 'error' | 'neutral'> = {
  Assigned: 'info',
  Submitted: 'warning',
  Approved: 'success',
  Rejected: 'error',
  Cancelled: 'neutral',
};

type ReviewDraft = { task: IWorkTask; approve: boolean };

function TaskCard({ task, focused, onReview }: { task: IWorkTask; focused: boolean; onReview: (approve: boolean) => void }) {
  return (
    <SectionCard
      title={task.title}
      right={<Badge tone={STATUS_TONE[task.status]}>{WORK_TASK_STATUS_LABEL[task.status]}</Badge>}
      bodyClassName="pt-0 gap-1.5"
      className={focused ? 'border border-primary' : undefined}
    >
      <Text variant="caption" tone="muted">{taskSubtitle(task)}</Text>
      {task.description ? <Text variant="bodySmall">{task.description}</Text> : null}
      {task.submissionNote ? (
        <Text variant="caption">
          <Text variant="caption" className="font-semibold">Ghi chú khi nộp: </Text>
          {task.submissionNote}
        </Text>
      ) : null}
      {task.lateReason ? (
        <Text variant="caption" tone="warning">
          <Text variant="caption" tone="warning" className="font-semibold">Lý do trễ: </Text>
          {task.lateReason}
        </Text>
      ) : null}
      {task.reviewNote ? (
        <Text variant="caption" tone={task.status === 'Rejected' ? 'error' : 'muted'} className="font-semibold">
          {task.status === 'Rejected' ? 'Đã trả lại: ' : 'Nhận xét: '}
          {task.reviewNote}
        </Text>
      ) : null}
      {(task.rejectCount ?? 0) > 0 ? (
        <Text variant="caption" tone="muted">Đã trả lại {task.rejectCount} lần</Text>
      ) : null}
      {task.photos.length > 0 ? (
        <PhotoStrip server={task.photos.map((p) => ({ id: p.id, url: p.url, kind: 'Fault' as const, uploadedAt: p.uploadedAt }))} />
      ) : null}
      {task.status === 'Submitted' ? (
        <View className="flex-row gap-2 pt-1">
          <View className="flex-1">
            <Button size="sm" icon="check-circle-outline" onPress={() => onReview(true)}>
              Đạt
            </Button>
          </View>
          <View className="flex-1">
            <Button size="sm" variant="outline" icon="undo-variant" onPress={() => onReview(false)}>
              Trả lại
            </Button>
          </View>
        </View>
      ) : null}
    </SectionCard>
  );
}

function ReviewSheet({ draft, onClose, onDone }: { draft: ReviewDraft | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const approve = draft?.approve ?? true;

  useEffect(() => setNote(''), [draft]);

  async function submit() {
    if (!draft) return;
    const error = reviewNoteError(approve, note);
    if (error) {
      toast.warning(error);
      return;
    }
    setBusy(true);
    try {
      await reviewWorkTask(draft.task.id, approve, note.trim() || null);
      toast.success(approve ? 'Đã chấm Đạt' : 'Đã trả lại cho nhân viên');
      onDone();
    } catch (err: any) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={!!draft}
      title={draft ? `${approve ? 'Đạt' : 'Trả lại'}: ${draft.task.title}` : ''}
      onClose={onClose}
      footer={
        <Button loading={busy} variant={approve ? 'solid' : 'outline'} onPress={submit}>
          {approve ? 'Xác nhận Đạt' : 'Trả lại'}
        </Button>
      }
    >
      <TextField
        label={approve ? 'Nhận xét (tuỳ chọn)' : 'Lý do trả lại'}
        value={note}
        onChangeText={setNote}
        multiline
        numberOfLines={3}
        placeholder={approve ? 'Nhận xét cho nhân viên...' : 'Cần làm lại gì...'}
      />
    </Sheet>
  );
}

export function WorkTaskReviewScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ id?: string }>();
  const focusId = typeof params.id === 'string' && params.id.length > 0 ? params.id : null;

  const [tab, setTab] = useState<ReviewTab>('waiting');
  const [month, setMonth] = useState(() => dayjs().startOf('month').format('YYYY-MM-DD'));
  const [draft, setDraft] = useState<ReviewDraft | null>(null);

  // Mở cho một việc: nhảy tới tab + tháng giao của việc đó (một lần).
  const focus = useQuery({ queryKey: ['work-task-review', 'task', focusId], queryFn: () => getWorkTask(focusId!), enabled: !!focusId });
  useEffect(() => {
    if (!focus.data) return;
    setTab(tabForStatus(focus.data.status));
    setMonth(dayjs(focus.data.createdAt).startOf('month').format('YYYY-MM-DD'));
  }, [focus.data]);

  const waiting = tab === 'waiting';
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['work-task-review', 'list', waiting ? 'submitted' : month],
    queryFn: () => (waiting ? getWorkTasks({ status: 'Submitted' }) : getWorkTasks({ month })),
  });

  const tasks = (data ?? [])
    .filter((t) => inTab(t, tab))
    .sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : 0));

  function reviewed() {
    setDraft(null);
    qc.invalidateQueries({ queryKey: ['work-task-review'] });
    qc.invalidateQueries({ queryKey: ['home', 'work-today'] });
  }

  return (
    <Screen scroll refreshing={isFetching && !isLoading} onRefresh={refetch}>
      <AppHeader title="Chấm việc giao" back />

      <SegmentedControl
        segments={REVIEW_TABS}
        value={tab}
        onChange={(k) => setTab(k as ReviewTab)}
        className="my-1"
      />

      {!waiting ? (
        <View className="flex-row items-center justify-between gap-2 py-1">
          <Pressable
            onPress={() => setMonth((m) => dayjs(m).subtract(1, 'month').format('YYYY-MM-DD'))}
            accessibilityLabel="Tháng trước"
            className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
          >
            <Icon name="chevron-left" size={20} tone="default" />
          </Pressable>
          <Text variant="subtitle">Giao trong tháng {dayjs(month).format('MM/YYYY')}</Text>
          <Pressable
            onPress={() => setMonth((m) => dayjs(m).add(1, 'month').format('YYYY-MM-DD'))}
            accessibilityLabel="Tháng sau"
            className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
          >
            <Icon name="chevron-right" size={20} tone="default" />
          </Pressable>
        </View>
      ) : null}

      {isLoading ? (
        <View className="gap-3 pt-2">
          <Skeleton width="100%" height={120} radius={16} />
          <Skeleton width="100%" height={120} radius={16} />
        </View>
      ) : isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được việc giao: {extractApiError(error)}</Text>
          <Button size="sm" variant="outline" onPress={() => refetch()}>Thử lại</Button>
        </View>
      ) : tasks.length === 0 ? (
        <EmptyState
          icon="clipboard-check-outline"
          title={waiting ? 'Không có việc chờ chấm' : 'Không có việc nào'}
          description={waiting ? 'Nhân viên nộp việc giao riêng thì việc hiện ở đây.' : 'Giao việc cho một người trên web.'}
        />
      ) : (
        <View className="gap-3 pt-1">
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} focused={t.id === focusId} onReview={(approve) => setDraft({ task: t, approve })} />
          ))}
        </View>
      )}

      <ReviewSheet draft={draft} onClose={() => setDraft(null)} onDone={reviewed} />
    </Screen>
  );
}
