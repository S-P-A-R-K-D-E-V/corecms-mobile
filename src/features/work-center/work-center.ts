import dayjs from 'dayjs';

import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasAnyPermission } from 'src/auth/permissions';
import type { IconName } from 'src/components/ui';
import type { AgentTaskView } from 'src/api/agent-center';
import type { WorkHubItem } from 'src/api/work-hub';

import { agentTaskRoute, taskStatusInfo } from 'src/features/agent-tasks/agent-task-format';

// ----------------------------------------------------------------------
// Trung tâm việc trên app (T3 — docs/cici/plans/trung-tam-viec-ui-plan.md), phần thuần test được: gộp việc agent (AG-), việc
// giao nhân viên (CV-) và vệ sinh theo ca (VS-) về cột chung như bảng web, chia 3 tab:
//   Cần xử lý = chờ duyệt / chờ người + lỗi / trả lại / quá hạn (việc đã đóng chỉ từ hôm qua, bỏ việc huỷ)
//   Đang làm  = chờ làm + đang chạy
//   Xong      = xong hôm nay
// Ca vệ sinh trước hôm qua chưa làm / chưa chấm không đưa lên (như web — xem ở màn Chấm vệ sinh).
// ----------------------------------------------------------------------

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'secondary';

export type WorkKind = 'agent' | 'work' | 'cleaning';
export type WorkColumn = 'queued' | 'running' | 'waiting' | 'done' | 'ended';
export type WorkSegment = 'todo' | 'doing' | 'done';
export type KindFilter = 'all' | WorkKind;

export const WORK_SEGMENTS: { key: WorkSegment; label: string }[] = [
  { key: 'todo', label: 'Cần xử lý' },
  { key: 'doing', label: 'Đang làm' },
  { key: 'done', label: 'Xong hôm nay' },
];

export const KIND_FILTERS: { key: KindFilter; label: string; icon?: IconName }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'agent', label: 'Agent', icon: 'robot-outline' },
  { key: 'work', label: 'Việc giao', icon: 'clipboard-account-outline' },
  { key: 'cleaning', label: 'Vệ sinh', icon: 'broom' },
];

export const KIND_ICON: Record<WorkKind, IconName> = {
  agent: 'robot-outline',
  work: 'clipboard-account-outline',
  cleaning: 'broom',
};

export interface WorkEntry {
  key: string;
  kind: WorkKind;
  id: string;
  code: string;
  title: string;
  /** Agent: tên agent; việc giao / vệ sinh: người làm. */
  who: string | null;
  note: string | null;
  column: WorkColumn;
  statusLabel: string;
  tone: Tone;
  /** Chưa đóng (agent chưa xong; việc giao Đã giao / Chờ duyệt / Trả lại; ca chưa làm / chưa chấm). */
  open: boolean;
  cancelled: boolean;
  dueAt: string | null;
  overdue: boolean;
  sortAt: string;
  /** Ngày của ca vệ sinh (yyyy-MM-dd). */
  date: string | null;
  block: string | null;
  progress: { passed: number; total: number; failed: number } | null;
}

/** Ai thấy Trung tâm việc trên app: một trong ba quyền (khớp MANAGE_SCREEN_PERMISSIONS.workCenter). */
export function canSeeWorkCenter(user: AuthUser | null | undefined): boolean {
  return hasAnyPermission(user, [PERMISSIONS.agent.approve, PERMISSIONS.hr.taskManage, PERMISSIONS.cleaning.review]);
}

/** Nguồn nào được tải theo quyền — tránh gọi API sẽ trả 403. */
export function workSources(user: AuthUser | null | undefined): { agent: boolean; work: boolean; cleaning: boolean } {
  return {
    agent: hasAnyPermission(user, [PERMISSIONS.agent.approve]),
    work: hasAnyPermission(user, [PERMISSIONS.hr.taskManage]),
    cleaning: hasAnyPermission(user, [PERMISSIONS.cleaning.review]),
  };
}

const AGENT_COLUMN: Record<string, WorkColumn> = {
  queued: 'queued',
  running: 'running',
  waiting_children: 'running',
  waiting_approval: 'waiting',
  waiting_human: 'waiting',
  done: 'done',
  failed: 'ended',
  stopped: 'ended',
  cancelled: 'ended',
};

/** Cột của một trạng thái agent; trạng thái lạ coi như đang chạy. */
export function agentColumn(status: string): WorkColumn {
  return AGENT_COLUMN[status] ?? 'running';
}

export function fromAgentTask(t: AgentTaskView): WorkEntry {
  const column = agentColumn(t.status);
  const info = taskStatusInfo(t.status);
  return {
    key: `agent:${t.id}`,
    kind: 'agent',
    id: t.id,
    code: `AG-${t.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
    title: t.title || '(Chưa đặt tên)',
    who: t.agentName || null,
    note: t.status === 'failed' ? t.error : t.currentStepLabel,
    column,
    statusLabel: info.label,
    tone: info.tone,
    open: column !== 'done' && column !== 'ended',
    cancelled: t.status === 'cancelled',
    dueAt: null,
    overdue: false,
    sortAt: t.finishedAt ?? t.startedAt ?? t.createdAt,
    date: null,
    block: null,
    progress: null,
  };
}

const COLUMN_TONE: Record<WorkColumn, Tone> = {
  queued: 'info',
  running: 'primary',
  waiting: 'warning',
  done: 'success',
  ended: 'error',
};

const OPEN_WORK = ['Assigned', 'Submitted', 'Rejected'];

export function fromHubItem(i: WorkHubItem): WorkEntry {
  const column = (['queued', 'running', 'waiting', 'done', 'ended'].includes(i.column) ? i.column : 'queued') as WorkColumn;
  const cleaning = i.kind === 'cleaning';
  const cancelled = !cleaning && i.status === 'Cancelled';
  return {
    key: `${i.kind}:${i.id}`,
    kind: i.kind,
    id: i.id,
    code: i.code,
    title: i.title,
    who: i.assigneeName,
    note: cleaning ? null : i.subtitle,
    column,
    statusLabel: i.statusLabel,
    tone: cancelled ? 'neutral' : COLUMN_TONE[column],
    open: cleaning ? column === 'queued' || column === 'waiting' : OPEN_WORK.includes(i.status),
    cancelled,
    dueAt: i.dueAt,
    overdue: i.overdue,
    sortAt: i.sortAt,
    date: i.date,
    block: i.block,
    progress: cleaning && i.total > 0 ? { passed: i.passed, total: i.total, failed: i.failed } : null,
  };
}

export function segmentOf(column: WorkColumn): WorkSegment {
  if (column === 'waiting' || column === 'ended') return 'todo';
  if (column === 'done') return 'done';
  return 'doing';
}

/** Mục có hiện trên bảng không (theo mốc `now`): việc huỷ, việc đóng trước hôm qua, ca vệ sinh cũ chưa xong → không. */
export function isOnBoard(e: WorkEntry, now: number): boolean {
  if (e.cancelled) return false;
  const today = dayjs(now).startOf('day');
  const yesterday = today.subtract(1, 'day');
  if (e.kind === 'cleaning' && e.open && e.date && dayjs(e.date).isBefore(yesterday, 'day')) return false;
  if (e.column === 'done') return !dayjs(e.sortAt).isBefore(today);
  if (e.column === 'ended' && !e.open) return !dayjs(e.sortAt).isBefore(yesterday);
  return true;
}

/** Thứ tự trong tab Cần xử lý: chờ duyệt trước lỗi; trong cùng cột mới trước. */
const COLUMN_ORDER: Record<WorkColumn, number> = { waiting: 0, ended: 1, running: 2, queued: 3, done: 4 };

export function buildWorkCenter(
  entries: readonly WorkEntry[],
  now: number
): { lists: Record<WorkSegment, WorkEntry[]>; counts: Record<WorkSegment, number> } {
  const lists: Record<WorkSegment, WorkEntry[]> = { todo: [], doing: [], done: [] };
  for (const e of entries) if (isOnBoard(e, now)) lists[segmentOf(e.column)].push(e);
  for (const key of Object.keys(lists) as WorkSegment[]) {
    lists[key].sort((a, b) => COLUMN_ORDER[a.column] - COLUMN_ORDER[b.column] || b.sortAt.localeCompare(a.sortAt));
  }
  return { lists, counts: { todo: lists.todo.length, doing: lists.doing.length, done: lists.done.length } };
}

export function filterKind(entries: readonly WorkEntry[], kind: KindFilter): WorkEntry[] {
  return kind === 'all' ? [...entries] : entries.filter((e) => e.kind === kind);
}

export type WorkRoute = string | { pathname: string; params: Record<string, string> };

/** Bấm mục mở màn nào (theo quyền) — không đủ quyền → null (thẻ không bấm được). */
export function workEntryRoute(e: WorkEntry, user: AuthUser | null | undefined): WorkRoute | null {
  const src = workSources(user);
  if (e.kind === 'agent') return src.agent ? agentTaskRoute(e.id) : null;
  if (e.kind === 'work') return src.work ? { pathname: '/manage/work-tasks', params: { id: e.id } } : null;
  if (!hasAnyPermission(user, [PERMISSIONS.cleaning.read]) || !e.date || !e.block) return null;
  return { pathname: '/manage/cleaning-review', params: { date: e.date, block: e.block } };
}

/** Dòng phụ: người / agent · hạn (đỏ khi quá hạn do màn tự tô) hoặc giờ. */
export function entryMeta(e: WorkEntry, now: number): string {
  const parts: string[] = [];
  if (e.who) parts.push(e.who);
  if (e.dueAt && e.column !== 'done') {
    const due = dayjs(e.dueAt);
    parts.push(`hạn ${due.isSame(dayjs(now), 'day') ? due.format('HH:mm') : due.format('HH:mm DD/MM')}`);
  } else if (e.kind !== 'cleaning' && e.sortAt) {
    parts.push(dayjs(e.sortAt).format('HH:mm DD/MM'));
  }
  return parts.join(' · ');
}
