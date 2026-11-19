import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// Trung tâm việc (Core-be T2, GET /work-hub/items): việc giao một người (CV-) + vệ sinh gộp theo ca (VS-), quy về cột chung
// với bảng việc agent. Việc giao: hr.task.manage thấy mọi người, còn lại chỉ việc của mình; vệ sinh cần cleaning.read.
// ----------------------------------------------------------------------

export type WorkHubColumn = 'queued' | 'running' | 'waiting' | 'done' | 'ended';

export interface WorkHubItem {
  kind: 'work' | 'cleaning';
  /** Việc giao: GUID; vệ sinh: "yyyy-MM-dd|Block". */
  id: string;
  code: string;
  title: string;
  subtitle: string | null;
  column: WorkHubColumn | (string & {});
  /** Việc giao: Assigned / Submitted / Approved / Rejected / Cancelled; vệ sinh: pending / review / missed / failed / passed. */
  status: string;
  statusLabel: string;
  assigneeName: string | null;
  createdAt: string;
  dueAt: string | null;
  finishedAt: string | null;
  sortAt: string;
  overdue: boolean;
  photoCount: number;
  date: string | null;
  block: string | null;
  total: number;
  passed: number;
  failed: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function normalizeWorkHubItem(raw: any): WorkHubItem {
  const i = raw ?? {};
  return {
    kind: i.kind === 'cleaning' ? 'cleaning' : 'work',
    id: String(i.id ?? ''),
    code: String(i.code ?? ''),
    title: String(i.title ?? ''),
    subtitle: str(i.subtitle),
    column: String(i.column ?? 'queued'),
    status: String(i.status ?? ''),
    statusLabel: String(i.statusLabel ?? ''),
    assigneeName: str(i.assigneeName),
    createdAt: String(i.createdAt ?? ''),
    dueAt: str(i.dueAt),
    finishedAt: str(i.finishedAt),
    sortAt: String(i.sortAt ?? i.createdAt ?? ''),
    overdue: i.overdue === true,
    photoCount: num(i.photoCount),
    date: str(i.date),
    block: str(i.block),
    total: num(i.total),
    passed: num(i.passed),
    failed: num(i.failed),
  };
}

/** `days`: việc đã đóng + vệ sinh trong N ngày gần nhất (1–31); việc giao chưa xong luôn có. */
export async function getWorkHubItems(days = 7, kinds: readonly ('work' | 'cleaning')[] = ['work', 'cleaning']): Promise<WorkHubItem[]> {
  const res = await axios.get<unknown>(endpoints.workHub.items, { params: { days, kinds: kinds.join(',') } });
  return Array.isArray(res.data) ? res.data.map(normalizeWorkHubItem) : [];
}
