import type { IconName } from 'src/components/ui';
import type { AgentCenterSummary, AgentPlanItem, AgentTaskView } from 'src/api/agent-center';

// ----------------------------------------------------------------------
// Phần thuần của màn Việc của agent (test được): nhãn trạng thái, nhóm (tab), tiến độ kế hoạch, thời gian chạy, token,
// nhịp tự làm mới, việc được phép bấm gì.
// ----------------------------------------------------------------------

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'secondary';

export const AGENT_TASK_STATUS: Record<string, { label: string; tone: Tone; icon: IconName }> = {
  queued: { label: 'Chờ chạy', tone: 'info', icon: 'progress-clock' },
  running: { label: 'Đang chạy', tone: 'primary', icon: 'robot-outline' },
  waiting_approval: { label: 'Chờ duyệt', tone: 'warning', icon: 'shield-check-outline' },
  waiting_human: { label: 'Chờ người', tone: 'warning', icon: 'account-voice' },
  waiting_children: { label: 'Chờ việc con', tone: 'info', icon: 'source-branch' },
  done: { label: 'Xong', tone: 'success', icon: 'check-circle-outline' },
  failed: { label: 'Lỗi', tone: 'error', icon: 'alert-circle-outline' },
  stopped: { label: 'Đã dừng', tone: 'neutral', icon: 'stop-circle-outline' },
  cancelled: { label: 'Đã huỷ', tone: 'neutral', icon: 'cancel' },
};

export function taskStatusInfo(status: string): { label: string; tone: Tone; icon: IconName } {
  return AGENT_TASK_STATUS[status] ?? { label: status || '—', tone: 'neutral', icon: 'robot-outline' };
}

/** Tab của màn danh sách. */
export type TaskSegment = 'active' | 'done' | 'ended';

export const TASK_SEGMENTS: { key: TaskSegment; label: string }[] = [
  { key: 'active', label: 'Đang làm' },
  { key: 'done', label: 'Xong' },
  { key: 'ended', label: 'Lỗi / Dừng' },
];

/** Trạng thái gửi lên máy chủ cho từng tab (`status` nối bằng dấu phẩy). */
export const SEGMENT_STATUSES: Record<TaskSegment, readonly string[]> = {
  active: ['queued', 'running', 'waiting_children', 'waiting_approval', 'waiting_human'],
  done: ['done'],
  ended: ['failed', 'stopped', 'cancelled'],
};

/** Tab của một trạng thái; trạng thái lạ (BE thêm mới) coi như chưa xong → "Đang làm". */
export function taskSegment(status: string): TaskSegment {
  if (SEGMENT_STATUSES.done.includes(status)) return 'done';
  if (SEGMENT_STATUSES.ended.includes(status)) return 'ended';
  return 'active';
}

/** Đang chạy / chờ chạy — runner có thể đổi việc bất kỳ lúc nào, cần làm mới nhanh. */
export function isLiveStatus(status: string): boolean {
  return status === 'running' || status === 'queued';
}

/**
 * Đang chờ (người duyệt phiếu / trả lời, hoặc việc con — A2) — đổi chậm hơn. Việc chờ việc con vẫn dừng được (máy chủ dừng
 * ngay, như chờ người), không huỷ / chạy lại được.
 */
export function isWaitingStatus(status: string): boolean {
  return status === 'waiting_approval' || status === 'waiting_human' || status === 'waiting_children';
}

/**
 * Dòng tiến độ việc con của việc đang "Chờ việc con": "Chờ 1/3 việc con". Trạng thái khác hoặc máy chủ chưa gửi số
 * (childrenTotal = 0) → null.
 */
export function waitingChildrenText(task: Pick<AgentTaskView, 'status' | 'childrenTotal' | 'childrenDone'>): string | null {
  if (task.status !== 'waiting_children') return null;
  const total = Number(task.childrenTotal) || 0;
  if (total <= 0) return null;
  const done = Math.min(Math.max(Number(task.childrenDone) || 0, 0), total);
  return `Chờ ${done}/${total} việc con`;
}

// ── Nhịp làm mới ─────────────────────────────────────────────────────────

export const LIST_LIVE_REFRESH_MS = 5_000;
export const LIST_IDLE_REFRESH_MS = 30_000;
export const DETAIL_LIVE_REFRESH_MS = 3_000;
export const DETAIL_WAITING_REFRESH_MS = 15_000;
export const SUMMARY_REFRESH_MS = 30_000;

/**
 * Nhịp tự làm mới danh sách: màn không hiện / app ở nền → dừng; có việc đang chạy / chờ chạy trong danh sách → 5 giây;
 * còn lại 30 giây.
 */
export function listRefreshMs(tasks: readonly Pick<AgentTaskView, 'status'>[] | undefined, active: boolean): number | false {
  if (!active) return false;
  return tasks?.some((t) => isLiveStatus(t.status)) ? LIST_LIVE_REFRESH_MS : LIST_IDLE_REFRESH_MS;
}

/** Nhịp làm mới màn chi tiết: đang chạy / chờ chạy 3 giây; chờ người / chờ duyệt 15 giây; đã kết thúc thì thôi. */
export function detailRefreshMs(status: string | undefined, active: boolean): number | false {
  if (!active || !status) return false;
  if (isLiveStatus(status)) return DETAIL_LIVE_REFRESH_MS;
  if (isWaitingStatus(status)) return DETAIL_WAITING_REFRESH_MS;
  return false;
}

// ── Tiến độ / thời gian / token ─────────────────────────────────────────

/** Bước kế hoạch đã qua: làm xong hoặc bỏ qua. */
export function isPlanItemFinished(item: Pick<AgentPlanItem, 'status'>): boolean {
  return item.status === 'done' || item.status === 'skipped';
}

/** Tiến độ kế hoạch: số bước đã qua (xong + bỏ qua) / tổng. Không có kế hoạch → null. */
export function planProgress(plan: readonly Pick<AgentPlanItem, 'status'>[] | null | undefined): { done: number; total: number } | null {
  if (!plan || plan.length === 0) return null;
  return { done: plan.filter(isPlanItemFinished).length, total: plan.length };
}

export function planItemIcon(status: string): { icon: IconName; tone: 'success' | 'primary' | 'muted' | 'faint' } {
  switch (status) {
    case 'done':
      return { icon: 'checkbox-marked-circle-outline', tone: 'success' };
    case 'in_progress':
      return { icon: 'progress-clock', tone: 'primary' };
    case 'skipped':
      return { icon: 'minus-circle-outline', tone: 'faint' };
    default:
      return { icon: 'checkbox-blank-circle-outline', tone: 'muted' };
  }
}

function ts(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = new Date(value).getTime();
  return Number.isFinite(n) ? n : null;
}

/**
 * Thời gian việc đã chạy (ms): từ lúc bắt đầu tới lúc kết thúc, chưa kết thúc thì tới `now`. Chưa bắt đầu (đang chờ chạy
 * lần đầu) → null.
 */
export function elapsedMs(
  task: Pick<AgentTaskView, 'startedAt' | 'finishedAt'>,
  now: number = Date.now()
): number | null {
  const start = ts(task.startedAt);
  if (start === null) return null;
  const end = ts(task.finishedAt) ?? now;
  return Math.max(0, end - start);
}

/** "45 giây" / "3 phút 5 giây" / "2 giờ 10 phút" / "1 ngày 3 giờ". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec} giây`;
  const minutes = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (minutes < 60) return sec > 0 ? `${minutes} phút ${sec} giây` : `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours} giờ ${mins} phút` : `${hours} giờ`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return hrs > 0 ? `${days} ngày ${hrs} giờ` : `${days} ngày`;
}

/** Thời lượng một bước: "850 ms" / "1,2 giây" / "2 phút 3 giây". */
export function formatStepDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(Math.round(ms / 100) / 10).toString().replace('.', ',')} giây`;
  return formatDuration(ms);
}

/** Tổng token vào + ra. */
export function totalTokens(task: Pick<AgentTaskView, 'inputTokens' | 'outputTokens'>): number {
  return (task.inputTokens || 0) + (task.outputTokens || 0);
}

function compact(n: number, unit: number, suffix: string): string {
  const v = Math.round((n / unit) * 10) / 10;
  return `${v.toString().replace('.', ',')}${suffix}`;
}

/** 850 → "850"; 12 345 → "12,3K"; 1 500 000 → "1,5M". */
export function formatTokens(n: number | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '0';
  if (v < 1000) return String(Math.round(v));
  if (v < 1_000_000) return compact(v, 1000, 'K');
  return compact(v, 1_000_000, 'M');
}

export const SOURCE_LABEL: Record<string, string> = {
  manual: 'Giao tay',
  schedule: 'Theo lịch',
  agent: 'Agent khác giao',
  event: 'Theo sự kiện',
  chat: 'Nhóm quản trị',
};

export function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? (source || '—');
}

// ── Bước (timeline) ─────────────────────────────────────────────────────

export const STEP_KIND: Record<string, { label: string; icon: IconName }> = {
  model: { label: 'Suy nghĩ', icon: 'brain' },
  tool: { label: 'Gọi công cụ', icon: 'wrench-outline' },
  plan: { label: 'Kế hoạch', icon: 'format-list-checks' },
  note: { label: 'Chỉ dẫn', icon: 'message-text-outline' },
  approval: { label: 'Duyệt', icon: 'shield-check-outline' },
  system: { label: 'Hệ thống', icon: 'cog-outline' },
};

export function stepKindInfo(kind: string): { label: string; icon: IconName } {
  return STEP_KIND[kind] ?? { label: kind || 'Bước', icon: 'cog-outline' };
}

// ── Thao tác được phép (máy chủ vẫn kiểm lại, sai trạng thái → 409) ─────

export function canStopTask(status: string): boolean {
  return isLiveStatus(status) || isWaitingStatus(status);
}

export function canRetryTask(status: string): boolean {
  return status === 'failed' || status === 'stopped';
}

export function canCancelTask(status: string): boolean {
  return status === 'queued';
}

/** Nhắn chỉ dẫn: mọi việc chưa xong / chưa huỷ (việc lỗi / đã dừng vẫn nhắn được để agent đọc khi chạy lại). */
export function canNoteTask(status: string): boolean {
  return status !== 'done' && status !== 'cancelled';
}

// ── Thẻ trang chủ ───────────────────────────────────────────────────────

/** Số cho thẻ "Agent đang chạy": null khi không có gì đáng hiện (cả hai bằng 0) hoặc chưa có dữ liệu. */
export function runningCardCounts(summary: AgentCenterSummary | null | undefined): { running: number; waitingHuman: number } | null {
  if (!summary) return null;
  const running = summary.counts.running || 0;
  const waitingHuman = summary.counts.waiting_human || 0;
  return running > 0 || waitingHuman > 0 ? { running, waitingHuman } : null;
}

/** Màn chi tiết việc trong app. */
export function agentTaskRoute(id: string): string {
  return `/agent/tasks/${id}`;
}

export const AGENT_TASKS_ROUTE = '/agent/tasks';
