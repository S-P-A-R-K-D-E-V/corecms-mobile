import { useState } from 'react';
import { Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { AppHeader, Loading, Screen, SectionCard } from 'src/components/shared';
import { Badge, Button, Divider, Icon, Pressable, Text, TextField } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import type { AgentRunStep, AgentTaskView } from 'src/api/agent-center';
import { agentActionRoute } from 'src/features/agent-approvals/agent-action-format';

import {
  canCancelTask,
  canNoteTask,
  canRetryTask,
  canStopTask,
  elapsedMs,
  formatDuration,
  formatStepDuration,
  formatTokens,
  isLiveStatus,
  planItemIcon,
  planProgress,
  sourceLabel,
  stepKindInfo,
  taskStatusInfo,
  waitingChildrenText,
  totalTokens,
} from './agent-task-format';
import {
  useAddAgentTaskNote,
  useAgentTask,
  useCancelAgentTask,
  useRetryAgentTask,
  useScreenActive,
  useStopAgentTask,
  useTicker,
} from './hooks';

// ----------------------------------------------------------------------
// Chi tiết một việc của agent: trạng thái, kế hoạch, kết quả / lỗi, các bước đã chạy; nhắn chỉ dẫn, Dừng / Chạy lại / Huỷ.
// Mở từ danh sách hoặc chạm thông báo (data.agentTaskId, actionUrl /dashboard/agent/center?task=). Tự làm mới 3 giây khi
// đang chạy / chờ chạy, 15 giây khi chờ người / chờ duyệt. 404 / 409 khi bấm = việc vừa đổi → nạp lại.
// ----------------------------------------------------------------------

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

function fmt(value: string | null | undefined, pattern = 'HH:mm:ss DD/MM/YYYY'): string {
  return value ? dayjs(value).format(pattern) : '—';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row gap-3 py-1">
      <Text variant="caption" tone="muted" className="w-28">{label}</Text>
      <Text variant="bodySmall" className="flex-1" selectable>{value}</Text>
    </View>
  );
}

function HeaderCard({ task, now }: { task: AgentTaskView; now: number }) {
  const status = taskStatusInfo(task.status);
  const elapsed = elapsedMs(task, now);
  const children = waitingChildrenText(task);
  const [showInstruction, setShowInstruction] = useState(false);

  return (
    <SectionCard
      title={task.agentName || 'Agent'}
      icon="robot-outline"
      right={<Badge tone={status.tone} icon={status.icon}>{status.label}</Badge>}
      bodyClassName="pt-0 gap-2"
    >
      <Text variant="body" className="font-semibold" selectable>{task.title || '(Chưa đặt tên)'}</Text>
      {children ? (
        <View className="flex-row items-center gap-1.5">
          <Icon name="source-branch" size={16} tone="primary" />
          <Text variant="bodySmall" tone="primary" className="font-semibold flex-1">{children}</Text>
        </View>
      ) : null}
      {task.currentStepLabel ? (
        <Text variant="bodySmall" tone={isLiveStatus(task.status) ? 'primary' : 'muted'}>{task.currentStepLabel}</Text>
      ) : null}
      {task.stopRequested && canStopTask(task.status) ? (
        <View className="flex-row gap-2 rounded-xl bg-warning-soft px-3 py-2">
          <Icon name="stop-circle-outline" size={16} tone="warning" />
          <Text variant="caption" tone="warning" className="flex-1">Đã yêu cầu dừng — agent dừng sau bước đang làm.</Text>
        </View>
      ) : null}
      <View>
        <InfoRow label="Nguồn" value={sourceLabel(task.source)} />
        <InfoRow label="Người giao" value={task.createdByName ?? (task.source === 'manual' ? '—' : 'Hệ thống')} />
        <InfoRow label="Tạo lúc" value={fmt(task.createdAt)} />
        <InfoRow label="Bắt đầu" value={fmt(task.startedAt)} />
        {task.finishedAt ? <InfoRow label="Kết thúc" value={fmt(task.finishedAt)} /> : null}
        <InfoRow label="Thời gian chạy" value={elapsed === null ? 'Chưa bắt đầu' : formatDuration(elapsed)} />
        <InfoRow
          label="Token"
          value={`${formatTokens(totalTokens(task))} (vào ${formatTokens(task.inputTokens)} · ra ${formatTokens(task.outputTokens)})`}
        />
        <InfoRow label="Gọi công cụ" value={`${task.toolCalls} lần`} />
      </View>
      {task.instruction ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            action="neutral"
            fullWidth={false}
            icon={showInstruction ? 'chevron-up' : 'text-box-outline'}
            onPress={() => setShowInstruction((v) => !v)}
          >
            {showInstruction ? 'Ẩn nội dung việc' : 'Xem nội dung việc'}
          </Button>
          {showInstruction ? <Text variant="bodySmall" selectable>{task.instruction}</Text> : null}
        </>
      ) : null}
    </SectionCard>
  );
}

function PlanCard({ task }: { task: AgentTaskView }) {
  const progress = planProgress(task.plan);
  if (!progress) return null;
  return (
    <SectionCard title={`Kế hoạch · ${progress.done}/${progress.total}`} icon="format-list-checks" bodyClassName="pt-0 gap-1.5">
      {task.plan.map((item, i) => {
        const look = planItemIcon(item.status);
        return (
          <View key={`${i}-${item.title}`} className="flex-row gap-2">
            <Icon name={look.icon} size={18} tone={look.tone} />
            <View className="flex-1">
              <Text
                variant="bodySmall"
                tone={item.status === 'skipped' ? 'faint' : 'default'}
                className={item.status === 'in_progress' ? 'font-semibold' : item.status === 'skipped' ? 'line-through' : undefined}
              >
                {item.title}
              </Text>
              {item.note ? <Text variant="caption" tone="muted">{item.note}</Text> : null}
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}

function OutcomeCard({ task }: { task: AgentTaskView }) {
  if (!task.result && !task.error) return null;
  return (
    <View className="gap-2">
      {task.result ? (
        <View className="gap-1 rounded-2xl bg-success-soft px-4 py-3">
          <View className="flex-row items-center gap-1.5">
            <Icon name="check-circle-outline" size={18} tone="success" />
            <Text variant="bodySmall" tone="success" className="font-semibold">Kết quả</Text>
          </View>
          <Text variant="bodySmall" selectable>{task.result}</Text>
        </View>
      ) : null}
      {task.error ? (
        <View className="gap-1 rounded-2xl bg-error-soft px-4 py-3">
          <View className="flex-row items-center gap-1.5">
            <Icon name="alert-circle-outline" size={18} tone="error" />
            <Text variant="bodySmall" tone="error" className="font-semibold">Lỗi</Text>
          </View>
          <Text variant="bodySmall" selectable>{task.error}</Text>
        </View>
      ) : null}
    </View>
  );
}

function StepRow({ step }: { step: AgentRunStep }) {
  const [open, setOpen] = useState(false);
  const kind = stepKindInfo(step.kind);
  const tone = step.status === 'error' ? 'error' : step.status === 'pending' ? 'warning' : 'muted';
  const meta = [
    kind.label,
    step.name,
    step.kind === 'note' ? step.authorName : null,
    formatStepDuration(step.durationMs),
    dayjs(step.createdAt).format('HH:mm:ss'),
  ].filter(Boolean);
  const hasDetail = !!step.detail;

  return (
    <Pressable
      onPress={hasDetail ? () => setOpen((v) => !v) : undefined}
      disabled={!hasDetail}
      accessibilityRole={hasDetail ? 'button' : undefined}
      accessibilityLabel={`${kind.label}: ${step.summary}`}
      className="flex-row gap-2.5 py-2"
    >
      <View className="w-7 h-7 rounded-full items-center justify-center bg-ink/5 dark:bg-white/10">
        <Icon name={kind.icon} size={15} tone={tone} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text variant="bodySmall" tone={step.status === 'error' ? 'error' : 'default'}>
          {step.summary || kind.label}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>{meta.join(' · ')}</Text>
        {open && step.detail ? (
          <View className="mt-1 rounded-xl bg-ink/5 dark:bg-white/5 px-3 py-2">
            <Text variant="caption" selectable style={{ fontFamily: MONO }}>{step.detail}</Text>
          </View>
        ) : null}
      </View>
      {hasDetail ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} tone="faint" /> : null}
    </Pressable>
  );
}

function StepsCard({ steps }: { steps: AgentRunStep[] }) {
  return (
    <SectionCard title="Các bước" icon="timeline-text-outline" count={steps.length} bodyClassName="pt-0">
      {steps.length === 0 ? (
        <Text variant="bodySmall" tone="muted">Chưa có bước nào.</Text>
      ) : (
        steps.map((step, i) => (
          <View key={step.id || String(step.seq)}>
            {i > 0 ? <Divider /> : null}
            <StepRow step={step} />
          </View>
        ))
      )}
    </SectionCard>
  );
}

function NoteBox({ task, busy, onSend }: { task: AgentTaskView; busy: boolean; onSend: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  const waitingHuman = task.status === 'waiting_human';
  const trimmed = text.trim();

  return (
    <SectionCard title="Nhắn agent" icon="message-text-outline" bodyClassName="pt-0 gap-2">
      {waitingHuman ? (
        <View className="flex-row gap-2 rounded-xl bg-warning-soft px-3 py-2.5">
          <Icon name="account-voice" size={18} tone="warning" />
          <Text variant="caption" tone="warning" className="flex-1">
            Agent đang chờ người trả lời. Gửi chỉ dẫn xong, việc quay lại hàng chờ và agent chạy tiếp theo chỉ dẫn của bạn.
          </Text>
        </View>
      ) : (
        <Text variant="caption" tone="muted">
          Chỉ dẫn được ghi vào việc; agent đọc ở bước kế tiếp (việc lỗi / đã dừng: agent đọc khi chạy lại).
        </Text>
      )}
      <TextField
        placeholder="Vd: chỉ kiểm chi nhánh Hà Đông, bỏ qua hàng đã ngừng bán"
        value={text}
        onChangeText={setText}
        multiline
        maxLength={4000}
        editable={!busy}
      />
      <Button
        icon="send-outline"
        loading={busy}
        disabled={busy || !trimmed}
        onPress={async () => {
          if (await onSend(trimmed)) setText('');
        }}
      >
        Gửi chỉ dẫn
      </Button>
    </SectionCard>
  );
}

export function AgentTaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const active = useScreenActive();
  const query = useAgentTask(id, active);
  const stopM = useStopAgentTask();
  const retryM = useRetryAgentTask();
  const cancelM = useCancelAgentTask();
  const noteM = useAddAgentTaskNote();
  const task = query.data?.task;
  const live = task ? isLiveStatus(task.status) : false;
  const now = useTicker(active && !!task && !task.finishedAt, live ? 1_000 : 30_000);
  const busy = stopM.isPending || retryM.isPending || cancelM.isPending;
  const notFound = (query.error as any)?.status === 404;

  async function run(kind: 'stop' | 'retry' | 'cancel') {
    if (!task) return;
    const copy = {
      stop: {
        title: 'Dừng việc này?',
        message: 'Agent dừng sau bước đang làm. Những gì đã làm không tự hoàn tác; việc đã dừng có thể chạy lại.',
        confirmText: 'Dừng',
        destructive: true,
        done: 'Agent sẽ dừng sau bước đang làm.',
        fail: 'Chưa dừng được',
      },
      retry: {
        title: 'Chạy lại việc này?',
        message: 'Việc quay lại hàng chờ; agent chạy tiếp từ hội thoại cũ, đọc cả chỉ dẫn bạn đã nhắn.',
        confirmText: 'Chạy lại',
        destructive: false,
        done: 'Đã đưa việc vào hàng chờ.',
        fail: 'Chưa chạy lại được',
      },
      cancel: {
        title: 'Huỷ việc này?',
        message: 'Việc chưa chạy sẽ bị huỷ và không chạy nữa.',
        confirmText: 'Huỷ việc',
        destructive: true,
        done: 'Đã huỷ việc.',
        fail: 'Chưa huỷ được',
      },
    }[kind];
    const ok = await confirm({
      title: copy.title,
      message: copy.message,
      confirmText: copy.confirmText,
      cancelText: 'Thôi',
      destructive: copy.destructive,
    });
    if (!ok) return;
    try {
      const m = kind === 'stop' ? stopM : kind === 'retry' ? retryM : cancelM;
      await m.mutateAsync(task.id);
      haptics.success();
      toast.success(copy.done);
    } catch (e: any) {
      haptics.error();
      if (e?.status === 409 || e?.status === 404) {
        // Việc vừa đổi trạng thái (runner chạy xong / người khác bấm) → nạp lại để thấy trạng thái mới.
        query.refetch();
        toast.warning(extractApiError(e), 'Việc đã thay đổi');
      } else {
        toast.error(extractApiError(e), copy.fail);
      }
    }
  }

  async function sendNote(text: string): Promise<boolean> {
    if (!task || !text) return false;
    const wasWaiting = task.status === 'waiting_human';
    try {
      await noteM.mutateAsync({ id: task.id, text });
      haptics.success();
      toast.success(wasWaiting ? 'Agent sẽ chạy tiếp theo chỉ dẫn của bạn.' : 'Agent sẽ đọc ở bước kế tiếp.', 'Đã gửi chỉ dẫn');
      return true;
    } catch (e: any) {
      haptics.error();
      if (e?.status === 409 || e?.status === 404) {
        query.refetch();
        toast.warning(extractApiError(e), 'Việc đã thay đổi');
      } else {
        toast.error(extractApiError(e), 'Chưa gửi được');
      }
      return false;
    }
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={query.isRefetching} onRefresh={query.refetch}>
      <AppHeader title="Việc của agent" back />
      {query.isLoading ? (
        <Loading />
      ) : query.isError || !task ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error" className="text-center">
            {notFound ? 'Không tìm thấy việc này.' : `Không tải được việc: ${extractApiError(query.error)}`}
          </Text>
          {notFound ? (
            <Button size="sm" variant="outline" fullWidth={false} onPress={() => router.replace('/agent/tasks' as any)}>
              Về danh sách việc
            </Button>
          ) : (
            <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
          )}
        </View>
      ) : (
        <>
          <HeaderCard task={task} now={now} />

          {task.pendingActionId ? (
            <Button
              variant="soft"
              icon="shield-check-outline"
              onPress={() => router.push(agentActionRoute(task.pendingActionId!) as any)}
            >
              Xem phiếu duyệt
            </Button>
          ) : null}

          <OutcomeCard task={task} />
          <PlanCard task={task} />

          {canStopTask(task.status) || canRetryTask(task.status) || canCancelTask(task.status) ? (
            <View className="flex-row gap-2">
              {canCancelTask(task.status) ? (
                <View className="flex-1">
                  <Button variant="outline" action="neutral" icon="cancel" disabled={busy} onPress={() => run('cancel')}>
                    Huỷ
                  </Button>
                </View>
              ) : null}
              {canStopTask(task.status) ? (
                <View className="flex-1">
                  <Button
                    variant="outline"
                    action="error"
                    icon="stop-circle-outline"
                    disabled={busy || task.stopRequested}
                    loading={stopM.isPending}
                    onPress={() => run('stop')}
                  >
                    {task.stopRequested ? 'Đang dừng…' : 'Dừng'}
                  </Button>
                </View>
              ) : null}
              {canRetryTask(task.status) ? (
                <View className="flex-1">
                  <Button icon="replay" disabled={busy} loading={retryM.isPending} onPress={() => run('retry')}>
                    Chạy lại
                  </Button>
                </View>
              ) : null}
            </View>
          ) : null}

          {canNoteTask(task.status) ? <NoteBox task={task} busy={noteM.isPending} onSend={sendNote} /> : null}

          <StepsCard steps={query.data?.steps ?? []} />
        </>
      )}
    </Screen>
  );
}
