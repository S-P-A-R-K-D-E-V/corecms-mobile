import axios, { endpoints } from './axios';

// ----------------------------------------------------------------------
// Bảng việc (Core-be GET /work-hub/items): việc giao một người (CV-) + việc theo ca gộp theo ca (VS-) + lỗi phải sửa (LO-) +
// sửa tận gốc (STG-), quy về cột chung với bảng việc agent. Việc giao: hr.task.manage thấy mọi người, còn lại chỉ việc của
// mình; việc theo ca cần cleaning.read; lỗi / sửa tận gốc: inspection.read thấy hết, người khác chỉ việc mình phụ trách.
// ----------------------------------------------------------------------

export type WorkHubColumn = 'queued' | 'running' | 'waiting' | 'done' | 'ended';
export type WorkHubKind = 'work' | 'cleaning' | 'fault' | 'corrective';
/** Nguồn của việc: lịch tuần tự sinh · quản lý / agent giao · từ kiểm tra. */
export type WorkHubSource = 'schedule' | 'assigned' | 'inspection' | 'agent';

const KINDS: readonly WorkHubKind[] = ['work', 'cleaning', 'fault', 'corrective'];
const SOURCES: readonly WorkHubSource[] = ['schedule', 'assigned', 'inspection', 'agent'];

export interface WorkHubItem {
  kind: WorkHubKind;
  /** Việc giao / lỗi / sửa tận gốc: GUID; việc theo ca: "yyyy-MM-dd|Block". */
  id: string;
  code: string;
  title: string;
  subtitle: string | null;
  column: WorkHubColumn | (string & {});
  /**
   * Việc giao: Assigned / Submitted / Approved / Rejected / Cancelled; việc theo ca: pending / review / missed / failed / passed;
   * lỗi: open / overdue / fixed; sửa tận gốc: suggested / open / overdue / done / dismissed.
   */
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
  source: WorkHubSource;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Nguồn mặc định khi core-be cũ chưa trả `source`. */
function defaultSource(kind: WorkHubKind): WorkHubSource {
  if (kind === 'cleaning') return 'schedule';
  if (kind === 'work') return 'assigned';
  return 'inspection';
}

export function normalizeWorkHubItem(raw: any): WorkHubItem {
  const i = raw ?? {};
  const kind: WorkHubKind = KINDS.includes(i.kind) ? i.kind : 'work';
  return {
    kind,
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
    source: SOURCES.includes(i.source) ? i.source : defaultSource(kind),
  };
}

/** `days`: việc đã đóng + việc theo ca trong N ngày gần nhất (1–31); việc giao / lỗi chưa xong luôn có. */
export async function getWorkHubItems(days = 7, kinds: readonly WorkHubKind[] = ['work', 'cleaning']): Promise<WorkHubItem[]> {
  const res = await axios.get<unknown>(endpoints.workHub.items, { params: { days, kinds: kinds.join(',') } });
  return Array.isArray(res.data) ? res.data.map(normalizeWorkHubItem) : [];
}
