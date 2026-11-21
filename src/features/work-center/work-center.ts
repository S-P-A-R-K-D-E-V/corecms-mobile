import dayjs from 'dayjs';

import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasAnyPermission } from 'src/auth/permissions';
import type { IconName } from 'src/components/ui';
import type { AgentTaskView } from 'src/api/agent-center';
import type { WorkHubItem, WorkHubKind, WorkHubSource } from 'src/api/work-hub';

import { agentTaskRoute, taskStatusInfo } from 'src/features/agent-tasks/agent-task-format';

// ----------------------------------------------------------------------
// Công việc (trước là Trung tâm việc — docs/cici/plans/cong-viec-mot-cho-plan.md mục 2), phần thuần test được. Bảng việc gộp
// việc agent (AG-), việc giao một người (CV-), việc theo ca (VS-), lỗi phải sửa (LO-) và sửa tận gốc (STG-) về cột chung như
// bảng web, chia 3 nhóm:
//   Cần xử lý = chờ duyệt / chờ người + lỗi / trả lại / quá hạn (việc đã đóng chỉ từ hôm qua, bỏ việc huỷ)
//   Đang làm  = chờ làm + đang chạy
//   Xong      = xong hôm nay
// Ca trước hôm qua chưa làm / chưa chấm không đưa lên (như web). Lọc theo nguồn: Agent / Lịch tuần / Được giao / Từ kiểm tra.
// ----------------------------------------------------------------------

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'secondary';

export type WorkKind = 'agent' | WorkHubKind;
export type WorkSource = WorkHubSource;
export type WorkColumn = 'queued' | 'running' | 'waiting' | 'done' | 'ended';
export type WorkSegment = 'todo' | 'doing' | 'done';
export type SourceFilter = 'all' | WorkSource;
/** Tab của màn Công việc. */
export type WorkTab = 'board' | 'schedule' | 'assign';

/** Gói vệ sinh / việc theo ca của cửa hàng (core-be RequireFeature WorkforceCleaning cho mọi API cleaning/*). */
const CLEANING_PLAN_FEATURE = 'workforce.cleaning';

export const WORK_TABS: { key: WorkTab; label: string }[] = [
  { key: 'board', label: 'Bảng việc' },
  { key: 'schedule', label: 'Lịch tuần' },
  { key: 'assign', label: 'Giao việc' },
];

export const WORK_SEGMENTS: { key: WorkSegment; label: string }[] = [
  { key: 'todo', label: 'Cần xử lý' },
  { key: 'doing', label: 'Đang làm' },
  { key: 'done', label: 'Xong hôm nay' },
];

export const SOURCE_FILTERS: { key: SourceFilter; label: string; icon?: IconName }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'agent', label: 'Agent', icon: 'robot-outline' },
  { key: 'schedule', label: 'Lịch tuần', icon: 'calendar-sync' },
  { key: 'assigned', label: 'Được giao', icon: 'clipboard-account-outline' },
  { key: 'inspection', label: 'Từ kiểm tra', icon: 'clipboard-search-outline' },
];

export const KIND_ICON: Record<WorkKind, IconName> = {
  agent: 'robot-outline',
  work: 'clipboard-account-outline',
  cleaning: 'broom',
  fault: 'alert-circle-outline',
  corrective: 'wrench-outline',
};

export interface WorkEntry {
  key: string;
  kind: WorkKind;
  source: WorkSource;
  id: string;
  code: string;
  title: string;
  /** Agent: tên agent; việc khác: người làm / người phụ trách. */
  who: string | null;
  note: string | null;
  column: WorkColumn;
  statusLabel: string;
  tone: Tone;
  /** Chưa đóng (agent chưa xong; việc giao Đã giao / Chờ duyệt / Trả lại; ca chưa làm / chưa chấm; lỗi chưa sửa…). */
  open: boolean;
  cancelled: boolean;
  dueAt: string | null;
  overdue: boolean;
  sortAt: string;
  /** Ngày của ca (yyyy-MM-dd). */
  date: string | null;
  block: string | null;
  progress: { passed: number; total: number; failed: number } | null;
}

/** Quyền vào màn Công việc (khớp MANAGE_SCREEN_PERMISSIONS.workCenter). */
const WORK_CENTER_PERMISSIONS = [
  PERMISSIONS.agent.approve,
  PERMISSIONS.hr.taskManage,
  PERMISSIONS.cleaning.read,
  PERMISSIONS.cleaning.review,
  PERMISSIONS.cleaning.templateManage,
];

/** Ai thấy màn Công việc (quản lý): một trong các quyền xem / giao / chấm việc. */
export function canSeeWorkCenter(user: AuthUser | null | undefined): boolean {
  return hasAnyPermission(user, WORK_CENTER_PERMISSIONS);
}

export interface WorkAccess {
  /** Việc agent (agent.approve). */
  agent: boolean;
  /** Việc giao của mọi người + giao một người + đổi người (hr.task.manage). */
  work: boolean;
  /** Việc theo ca trên bảng (cleaning.read). */
  cleaning: boolean;
  /** Lỗi phải sửa + sửa tận gốc của mọi người (inspection.read). */
  inspection: boolean;
  /** Xem Lịch tuần (cleaning.read + gói vệ sinh / việc theo ca). */
  schedule: boolean;
  /** Thêm / sửa / dừng việc định kỳ + giao cả ca (cleaning.template.manage + gói). */
  editSchedule: boolean;
}

/** Nguồn nào được tải / nút nào hiện theo quyền — tránh gọi API sẽ trả 403. */
export function workSources(user: AuthUser | null | undefined): WorkAccess {
  const plan = (user?.enabledFeatures ?? []).includes(CLEANING_PLAN_FEATURE);
  const read = hasAnyPermission(user, [PERMISSIONS.cleaning.read]);
  return {
    agent: hasAnyPermission(user, [PERMISSIONS.agent.approve]),
    work: hasAnyPermission(user, [PERMISSIONS.hr.taskManage]),
    cleaning: read,
    inspection: hasAnyPermission(user, [PERMISSIONS.inspection.read]),
    schedule: plan && read,
    editSchedule: plan && hasAnyPermission(user, [PERMISSIONS.cleaning.templateManage]),
  };
}

/** Các loại việc gọi /work-hub/items theo quyền. */
export function hubKinds(access: WorkAccess): WorkHubKind[] {
  return [
    ...(access.work ? (['work'] as const) : []),
    ...(access.cleaning ? (['cleaning'] as const) : []),
    ...(access.inspection ? (['fault', 'corrective'] as const) : []),
  ];
}

/** Tab hiện được: Bảng việc luôn có; Lịch tuần khi xem được lịch; Giao việc khi giao được cả ca hoặc một người. */
export function availableTabs(access: WorkAccess): WorkTab[] {
  return WORK_TABS.map((t) => t.key).filter(
    (k) => k === 'board' || (k === 'schedule' && access.schedule) || (k === 'assign' && (access.work || access.editSchedule))
  );
}

/** Tab mở từ tham số `?tab=` (link cũ, thông báo); lạ / không có quyền → Bảng việc. */
export function resolveTab(raw: unknown, access: WorkAccess): WorkTab {
  const tabs = availableTabs(access);
  return typeof raw === 'string' && (tabs as string[]).includes(raw) ? (raw as WorkTab) : 'board';
}

/** Bộ lọc nguồn mở từ `?source=`; lạ → Tất cả. */
export function resolveSource(raw: unknown): SourceFilter {
  return SOURCE_FILTERS.some((f) => f.key === raw) ? (raw as SourceFilter) : 'all';
}

/** Chip lọc nguồn hiện theo quyền (chỉ nguồn có thể có việc). */
export function sourceFilters(access: WorkAccess): typeof SOURCE_FILTERS {
  return SOURCE_FILTERS.filter(
    (f) =>
      f.key === 'all' ||
      (f.key === 'agent' && access.agent) ||
      (f.key === 'schedule' && (access.cleaning || access.work)) ||
      (f.key === 'assigned' && access.work) ||
      (f.key === 'inspection' && access.inspection)
  );
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
    source: 'agent',
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
/** Lỗi / sửa tận gốc còn phải làm (gợi ý chưa nhận cũng tính là mở). */
const OPEN_INSPECTION = ['open', 'overdue', 'suggested'];

function isOpen(i: WorkHubItem, column: WorkColumn): boolean {
  if (i.kind === 'cleaning') return column === 'queued' || column === 'waiting';
  if (i.kind === 'work') return OPEN_WORK.includes(i.status);
  return OPEN_INSPECTION.includes(i.status);
}

export function fromHubItem(i: WorkHubItem): WorkEntry {
  const column = (['queued', 'running', 'waiting', 'done', 'ended'].includes(i.column) ? i.column : 'queued') as WorkColumn;
  const cleaning = i.kind === 'cleaning';
  const cancelled = (i.kind === 'work' && i.status === 'Cancelled') || (i.kind === 'corrective' && i.status === 'dismissed');
  return {
    key: `${i.kind}:${i.id}`,
    kind: i.kind,
    source: i.source,
    id: i.id,
    code: i.code,
    title: i.title,
    who: i.assigneeName,
    note: cleaning ? null : i.subtitle,
    column,
    statusLabel: i.statusLabel,
    tone: cancelled ? 'neutral' : COLUMN_TONE[column],
    open: isOpen(i, column),
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

/** Mục có hiện trên bảng không (theo mốc `now`): việc huỷ / bỏ, việc đóng trước hôm qua, ca cũ chưa xong → không. */
export function isOnBoard(e: WorkEntry, now: number): boolean {
  if (e.cancelled) return false;
  const today = dayjs(now).startOf('day');
  const yesterday = today.subtract(1, 'day');
  if (e.kind === 'cleaning' && e.open && e.date && dayjs(e.date).isBefore(yesterday, 'day')) return false;
  if (e.column === 'done') return !dayjs(e.sortAt).isBefore(today);
  if (e.column === 'ended' && !e.open) return !dayjs(e.sortAt).isBefore(yesterday);
  return true;
}

/** Thứ tự trong nhóm Cần xử lý: chờ duyệt trước lỗi; trong cùng cột mới trước. */
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

export function filterSource(entries: readonly WorkEntry[], source: SourceFilter): WorkEntry[] {
  return source === 'all' ? [...entries] : entries.filter((e) => e.source === source);
}

export type WorkRoute = string | { pathname: string; params: Record<string, string> };

/** Màn chấm việc giao (một người) — dưới Công việc. */
export const TASK_REVIEW_PATH = '/manage/work-center/task-review';
/** Màn chấm việc theo ca của một ca — dưới Công việc. */
export const SHIFT_REVIEW_PATH = '/manage/work-center/shift-review';

/** Bấm mục mở màn nào (theo quyền) — không đủ quyền / chưa có màn trên app → null (thẻ không bấm được). */
export function workEntryRoute(e: WorkEntry, user: AuthUser | null | undefined): WorkRoute | null {
  const src = workSources(user);
  switch (e.kind) {
    case 'agent':
      return src.agent ? agentTaskRoute(e.id) : null;
    case 'work':
      return src.work ? { pathname: TASK_REVIEW_PATH, params: { id: e.id } } : null;
    case 'fault':
      return src.inspection ? '/inspection/faults' : null;
    case 'corrective':
      // Sửa tận gốc của mọi người chỉ xử lý trên web.
      return null;
    default:
      if (!src.cleaning || !e.date || !e.block) return null;
      return { pathname: SHIFT_REVIEW_PATH, params: { date: e.date, block: e.block } };
  }
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

// ---------------------------------------------------------------------- Màn cũ → Công việc

/** Màn quản lý cũ đã gộp vào Công việc (route cũ giữ lại chỉ để chuyển hướng link / thông báo / ghim cũ). */
export type LegacyWorkScreen = 'cleaning' | 'cleaning-builder' | 'cleaning-tasks' | 'cleaning-review' | 'work-tasks' | 'work-day';

export const WORK_CENTER_PATH = '/manage/work-center';

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : null);

/** Đích chuyển hướng của một màn cũ (giữ tham số còn dùng được: ngày + ca của ca cần chấm, id việc giao). */
export function legacyWorkRedirect(
  screen: LegacyWorkScreen,
  params: Record<string, unknown> = {}
): { pathname: string; params: Record<string, string> } {
  switch (screen) {
    case 'cleaning':
      return { pathname: WORK_CENTER_PATH, params: { tab: 'board', source: 'schedule' } };
    case 'cleaning-builder':
    case 'cleaning-tasks':
      return { pathname: WORK_CENTER_PATH, params: { tab: 'schedule' } };
    case 'cleaning-review': {
      const date = str(params.date);
      const block = str(params.block);
      return { pathname: SHIFT_REVIEW_PATH, params: { ...(date ? { date } : {}), ...(block ? { block } : {}) } };
    }
    case 'work-tasks': {
      const id = str(params.id);
      return id ? { pathname: TASK_REVIEW_PATH, params: { id } } : { pathname: WORK_CENTER_PATH, params: { tab: 'assign' } };
    }
    default:
      return { pathname: WORK_CENTER_PATH, params: { tab: 'board' } };
  }
}
