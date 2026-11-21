import dayjs from 'dayjs';

import type {
  CleaningShiftBlock,
  ICleaningSeries,
  ICreateCleaningSeriesRequest,
  IUpdateCleaningSeriesRequest,
} from 'src/types/corecms-api';
import type { IAssignWorkTaskRequest, IWorkTask } from 'src/types/hr';

// ----------------------------------------------------------------------
// Lịch tuần + Giao việc của màn Công việc (phần thuần, test được): dựng lịch một thứ từ các chuỗi việc định kỳ
// (GET cleaning/series), tóm tắt ô thứ × ca, kiểm + dựng body thêm / sửa việc định kỳ, giao cả ca một ngày, giao một người.
// Hợp đồng: docs/cici/plans/cong-viec-mot-cho-api-contract.md mục 3.
// ----------------------------------------------------------------------

export const BLOCKS: CleaningShiftBlock[] = ['Morning', 'Afternoon', 'Evening'];

export const BLOCK_LABEL: Record<CleaningShiftBlock, string> = { Morning: 'Sáng', Afternoon: 'Chiều', Evening: 'Tối' };

/** Thứ theo thứ tự tuần Việt Nam (T2 → CN); `dow` như Date.getDay (0 = CN). */
export const WEEK_DAYS: { dow: number; short: string; label: string }[] = [
  { dow: 1, short: 'T2', label: 'Thứ Hai' },
  { dow: 2, short: 'T3', label: 'Thứ Ba' },
  { dow: 3, short: 'T4', label: 'Thứ Tư' },
  { dow: 4, short: 'T5', label: 'Thứ Năm' },
  { dow: 5, short: 'T6', label: 'Thứ Sáu' },
  { dow: 6, short: 'T7', label: 'Thứ Bảy' },
  { dow: 0, short: 'CN', label: 'Chủ nhật' },
];

/** Nhóm gợi ý (người dùng vẫn gõ nhóm khác được). */
export const GROUP_SUGGESTIONS = ['Vệ sinh', 'Mở – đóng cửa', 'Trưng bày', 'Kho'];

const DAY_SHORT: Record<number, string> = Object.fromEntries(WEEK_DAYS.map((d) => [d.dow, d.short]));
const DAY_ORDER: Record<number, number> = Object.fromEntries(WEEK_DAYS.map((d, i) => [d.dow, i]));

export function isFixedAssignee(s: Pick<ICleaningSeries, 'assigneeUserId'>): boolean {
  return !!s.assigneeUserId;
}

export interface DaySchedule {
  Morning: ICleaningSeries[];
  Afternoon: ICleaningSeries[];
  Evening: ICleaningSeries[];
  /** Việc có người làm cố định (không theo ca). */
  fixed: ICleaningSeries[];
}

/**
 * Lịch của một thứ: việc định kỳ có ô ở thứ `dow`, chia theo ca; việc người làm cố định để riêng. Xếp theo nhóm rồi tên.
 * Chuỗi chỉ trả nếu còn hiệu lực từ ngày core-be được hỏi, nên không lọc ngày ở đây.
 */
export function buildDaySchedule(series: readonly ICleaningSeries[], dow: number): DaySchedule {
  const out: DaySchedule = { Morning: [], Afternoon: [], Evening: [], fixed: [] };
  for (const s of series) {
    const cells = s.cells.filter((c) => c.dayOfWeek === dow);
    if (cells.length === 0) continue;
    if (isFixedAssignee(s)) {
      out.fixed.push(s);
      continue;
    }
    for (const b of BLOCKS) if (cells.some((c) => c.block === b)) out[b].push(s);
  }
  const byName = (a: ICleaningSeries, b: ICleaningSeries) =>
    (a.group ?? '').localeCompare(b.group ?? '', 'vi') || a.name.localeCompare(b.name, 'vi');
  for (const k of [...BLOCKS, 'fixed'] as const) out[k].sort(byName);
  return out;
}

/** Số việc mỗi thứ (để hiện trên chip thứ). */
export function countByDay(series: readonly ICleaningSeries[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const d of WEEK_DAYS) out[d.dow] = 0;
  for (const s of series) for (const dow of new Set(s.cells.map((c) => c.dayOfWeek))) out[dow] = (out[dow] ?? 0) + 1;
  return out;
}

/**
 * Tóm tắt các ô: "Mọi ngày · Sáng, Tối" khi mọi thứ cùng ca; không thì từng thứ "T2: Sáng · T5: Sáng, Chiều".
 * Người làm cố định: chỉ thứ ("T2, T5" / "Mọi ngày").
 */
export function cellsSummary(s: Pick<ICleaningSeries, 'cells' | 'assigneeUserId'>): string {
  const days = [...new Set(s.cells.map((c) => c.dayOfWeek))].sort((a, b) => DAY_ORDER[a] - DAY_ORDER[b]);
  if (days.length === 0) return 'Chưa chọn thứ';
  const everyDay = days.length === 7;
  if (s.assigneeUserId) return everyDay ? 'Mọi ngày' : days.map((d) => DAY_SHORT[d]).join(', ');
  const blocksOf = (dow: number) =>
    BLOCKS.filter((b) => s.cells.some((c) => c.dayOfWeek === dow && c.block === b))
      .map((b) => BLOCK_LABEL[b])
      .join(', ');
  const first = blocksOf(days[0]);
  if (everyDay && days.every((d) => blocksOf(d) === first)) return `Mọi ngày · ${first}`;
  return days.map((d) => `${DAY_SHORT[d]}: ${blocksOf(d)}`).join(' · ');
}

/** "Từ 24/11" / "24/11 – 30/11" / "" (đang chạy từ trước, không hạn). */
export function rangeLabel(s: Pick<ICleaningSeries, 'fromDate' | 'toDate'>, today: string): string {
  const from = dayjs(s.fromDate);
  const fromLabel = from.isAfter(dayjs(today), 'day') ? from.format('DD/MM') : null;
  const to = s.toDate ? dayjs(s.toDate).format('DD/MM') : null;
  if (fromLabel && to) return fromLabel === to ? `Chỉ ${to}` : `${fromLabel} – ${to}`;
  if (fromLabel) return `Từ ${fromLabel}`;
  if (to) return `Đến ${to}`;
  return '';
}

// ---------------------------------------------------------------------- Biểu mẫu việc định kỳ

/** Ô đang chọn: khoá "dow|Block" (người làm cố định: "dow|*"). */
export type CellKey = string;

export const cellKey = (dow: number, block: CleaningShiftBlock | '*'): CellKey => `${dow}|${block}`;

export interface SeriesForm {
  name: string;
  area: string;
  group: string;
  requiresPhoto: boolean;
  autoViolation: boolean;
  /** null = người trong ca làm. */
  assigneeUserId: string | null;
  /** Thêm mới: ngày bắt đầu; sửa: áp dụng từ. */
  fromDate: string;
  toDate: string | null;
  cells: CellKey[];
}

export function emptySeriesForm(today: string): SeriesForm {
  return {
    name: '',
    area: '',
    group: GROUP_SUGGESTIONS[0],
    requiresPhoto: true,
    autoViolation: false,
    assigneeUserId: null,
    fromDate: today,
    toDate: null,
    cells: [],
  };
}

/** Biểu mẫu sửa từ một chuỗi có sẵn; áp dụng từ hôm nay (hoặc ngày bắt đầu nếu chuỗi chưa chạy). */
export function seriesToForm(s: ICleaningSeries, today: string): SeriesForm {
  const fixed = isFixedAssignee(s);
  const start = dayjs(s.fromDate).isAfter(dayjs(today), 'day') ? s.fromDate : today;
  return {
    name: s.name,
    area: s.area ?? '',
    group: s.group ?? '',
    requiresPhoto: s.requiresPhoto,
    autoViolation: fixed ? false : s.autoViolation,
    assigneeUserId: s.assigneeUserId ?? null,
    fromDate: start,
    toDate: s.toDate ?? null,
    cells: [...new Set(s.cells.map((c) => cellKey(c.dayOfWeek, fixed ? '*' : c.block)))],
  };
}

/** Đổi người làm cố định ↔ người trong ca: chuyển ô cho khớp (giữ thứ), tắt tự ghi vi phạm khi có người cố định. */
export function setAssignee(form: SeriesForm, assigneeUserId: string | null): SeriesForm {
  const days = [...new Set(form.cells.map((k) => Number(k.split('|')[0])))];
  const cells = assigneeUserId
    ? days.map((d) => cellKey(d, '*'))
    : form.assigneeUserId
      ? days.map((d) => cellKey(d, 'Morning'))
      : form.cells;
  return { ...form, assigneeUserId, cells, autoViolation: assigneeUserId ? false : form.autoViolation };
}

export function toggleCell(cells: readonly CellKey[], key: CellKey): CellKey[] {
  return cells.includes(key) ? cells.filter((k) => k !== key) : [...cells, key];
}

/** Bật / tắt một ca cho cả tuần: đủ 7 thứ thì tắt hết, chưa đủ thì bật hết. */
export function toggleBlockAllDays(cells: readonly CellKey[], block: CleaningShiftBlock | '*'): CellKey[] {
  const keys = WEEK_DAYS.map((d) => cellKey(d.dow, block));
  const all = keys.every((k) => cells.includes(k));
  return all ? cells.filter((k) => !keys.includes(k)) : [...new Set([...cells, ...keys])];
}

export type BuildResult<T> = { ok: true; body: T } | { ok: false; error: string };

const trimOrNull = (v: string) => (v.trim().length > 0 ? v.trim() : null);

function validate(form: SeriesForm, today: string): string | null {
  if (form.name.trim().length === 0) return 'Nhập tên việc.';
  if (form.cells.length === 0) return form.assigneeUserId ? 'Chọn ít nhất một thứ.' : 'Chọn ít nhất một ô thứ × ca.';
  if (dayjs(form.fromDate).isBefore(dayjs(today), 'day')) return 'Ngày áp dụng phải từ hôm nay trở đi.';
  if (form.toDate && dayjs(form.toDate).isBefore(dayjs(form.fromDate), 'day')) return 'Ngày kết thúc phải sau ngày bắt đầu.';
  return null;
}

function cellsBody(form: SeriesForm): ICreateCleaningSeriesRequest['cells'] {
  return form.cells
    .map((k) => {
      const [dow, block] = k.split('|');
      return { dayOfWeek: Number(dow), block: form.assigneeUserId || block === '*' ? null : (block as CleaningShiftBlock) };
    })
    .sort((a, b) => DAY_ORDER[a.dayOfWeek] - DAY_ORDER[b.dayOfWeek] || BLOCKS.indexOf(a.block!) - BLOCKS.indexOf(b.block!));
}

function common(form: SeriesForm) {
  const fixed = !!form.assigneeUserId;
  return {
    name: form.name.trim(),
    area: trimOrNull(form.area),
    group: trimOrNull(form.group),
    requiresPhoto: form.requiresPhoto,
    // Việc của người cố định là việc giao riêng — luật trễ hạn riêng, không tự ghi vi phạm trưởng ca.
    autoViolation: fixed ? false : form.autoViolation,
    assigneeUserId: form.assigneeUserId,
    toDate: form.toDate,
    cells: cellsBody(form),
  };
}

export function buildCreateSeriesBody(form: SeriesForm, today: string): BuildResult<ICreateCleaningSeriesRequest> {
  const error = validate(form, today);
  if (error) return { ok: false, error };
  return { ok: true, body: { ...common(form), fromDate: form.fromDate } };
}

export function buildUpdateSeriesBody(form: SeriesForm, today: string): BuildResult<IUpdateCleaningSeriesRequest> {
  const error = validate(form, today);
  if (error) return { ok: false, error };
  return { ok: true, body: { ...common(form), effectiveFrom: form.fromDate } };
}

/** Dừng từ ngày: phải từ hôm nay. */
export function stopDateError(fromDate: string, today: string): string | null {
  return dayjs(fromDate).isBefore(dayjs(today), 'day') ? 'Chỉ dừng được từ hôm nay trở đi.' : null;
}

// ---------------------------------------------------------------------- Giao việc

export interface ShiftAssignForm {
  date: string;
  block: CleaningShiftBlock;
  name: string;
  area: string;
  group: string;
  requiresPhoto: boolean;
}

/** Giao cả ca một ngày = việc định kỳ fromDate = toDate = ngày đó, đúng một ô; không tự ghi vi phạm. */
export function buildShiftAssignBody(form: ShiftAssignForm, today: string): BuildResult<ICreateCleaningSeriesRequest> {
  if (form.name.trim().length === 0) return { ok: false, error: 'Nhập tên việc.' };
  if (dayjs(form.date).isBefore(dayjs(today), 'day')) return { ok: false, error: 'Chỉ giao được từ hôm nay trở đi.' };
  return {
    ok: true,
    body: {
      name: form.name.trim(),
      area: trimOrNull(form.area),
      group: trimOrNull(form.group),
      requiresPhoto: form.requiresPhoto,
      autoViolation: false,
      assigneeUserId: null,
      fromDate: form.date,
      toDate: form.date,
      cells: [{ dayOfWeek: dayjs(form.date).day(), block: form.block }],
    },
  };
}

export interface PersonAssignForm {
  assigneeId: string | null;
  title: string;
  description: string;
  /** yyyy-MM-dd; null = không hạn. */
  dueDate: string | null;
  /** "HH:mm"; trống = 23:59. */
  dueTime: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Giao một người (POST work-tasks): hạn = ngày + giờ (giờ máy, gửi ISO). */
export function buildPersonAssignBody(form: PersonAssignForm, now: number): BuildResult<IAssignWorkTaskRequest> {
  if (!form.assigneeId) return { ok: false, error: 'Chọn người làm.' };
  if (form.title.trim().length === 0) return { ok: false, error: 'Nhập tên việc.' };
  let dueAt: string | null = null;
  if (form.dueDate) {
    const time = form.dueTime.trim() || '23:59';
    if (!TIME.test(time)) return { ok: false, error: 'Giờ hạn dạng HH:mm, vd 17:30.' };
    const due = dayjs(`${form.dueDate}T${time}:00`);
    if (due.valueOf() <= now) return { ok: false, error: 'Hạn phải sau lúc này.' };
    dueAt = due.toISOString();
  }
  return {
    ok: true,
    body: { title: form.title.trim(), description: trimOrNull(form.description), assigneeId: form.assigneeId, dueAt },
  };
}

/** Việc giao đổi người được: còn Đã giao / Trả lại (core-be kiểm lại). */
export function canReassign(task: Pick<IWorkTask, 'status'>): boolean {
  return task.status === 'Assigned' || task.status === 'Rejected';
}

/** Việc lặp tự sinh từ Lịch tuần (người làm cố định). */
export function isRecurringTask(task: Pick<IWorkTask, 'sourceTemplateId'>): boolean {
  return !!task.sourceTemplateId;
}

/** Việc giao còn mở cho danh sách tab Giao việc: chờ chấm trước, rồi trả lại, rồi đã giao; trong nhóm hạn gần trước. */
export function openAssignedTasks(tasks: readonly IWorkTask[]): IWorkTask[] {
  const order: Record<string, number> = { Submitted: 0, Rejected: 1, Assigned: 2 };
  const seen = new Set<string>();
  return tasks
    .filter((t) => t.group !== 'Initiative' && t.status in order && !seen.has(t.id) && (seen.add(t.id), true))
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] ||
        (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
        b.createdAt.localeCompare(a.createdAt)
    );
}
