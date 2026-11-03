import dayjs from 'dayjs';

import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import type { IWorkTodayItem, IWorkTodayPerson, WorkTodaySource } from 'src/types/hr';

// ----------------------------------------------------------------------
// Việc theo ngày (quản lý / chủ, phần thuần, test được): việc nào đánh dấu xong / gỡ được, ai được làm, nhãn ngày, lọc "chưa
// xong". Mỗi loại việc dùng API gốc của nó: việc giao riêng → work-tasks/{id}/complete|cancel; vệ sinh → cleaning review Đạt
// | skip; việc trong ca → shift-work/manage/done|remove. Gỡ = như chưa giao (không hiện cho nhân viên, không tính).
// ----------------------------------------------------------------------

export type WorkDayAction = 'done' | 'remove';

/** Quyền ghi của từng loại việc — khớp quyền endpoint core-be. */
const MANAGE_PERMISSION: Record<WorkTodaySource, string> = {
  work_task: PERMISSIONS.hr.taskManage,
  cleaning: PERMISSIONS.cleaning.review,
  shift_work: PERMISSIONS.inspection.manage,
};

/** Có quyền đánh dấu xong / gỡ loại việc này không. */
export function canManageSource(user: AuthUser | null | undefined, source: WorkTodaySource): boolean {
  return hasPermission(user, MANAGE_PERMISSION[source]);
}

/**
 * Việc đánh dấu xong / gỡ được trên ngày <paramref name="date"/> (YYYY-MM-DD). Đã xong → không gì. Việc trong ca Không đạt
 * (ca đã chấm) → không đổi được; việc trong ca của ngày chưa tới chỉ gỡ được. Thiếu ca + chi nhánh (core-be cũ) → không gì.
 */
export function itemActions(
  item: Pick<IWorkTodayItem, 'source' | 'status' | 'shiftScheduleId'>,
  date: string,
  user: AuthUser | null | undefined,
  today = dayjs().format('YYYY-MM-DD')
): WorkDayAction[] {
  if (item.status === 'done' || !canManageSource(user, item.source)) return [];
  if (item.source === 'shift_work') {
    if (!item.shiftScheduleId || item.status === 'failed') return [];
    return date > today ? ['remove'] : ['done', 'remove'];
  }
  return ['done', 'remove'];
}

/** Có ít nhất một loại việc đánh dấu / gỡ được (hiện gợi ý "bấm việc để …"). */
export function canManageAny(user: AuthUser | null | undefined): boolean {
  return (Object.keys(MANAGE_PERMISSION) as WorkTodaySource[]).some((s) => canManageSource(user, s));
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** "Hôm nay · 04/11", "Hôm qua · 03/11", "Ngày mai · 05/11", còn lại "T6 · 07/11". */
export function dayLabel(date: string, today = dayjs().format('YYYY-MM-DD')): string {
  const d = dayjs(date);
  const diff = d.diff(dayjs(today), 'day');
  const name = diff === 0 ? 'Hôm nay' : diff === -1 ? 'Hôm qua' : diff === 1 ? 'Ngày mai' : WEEKDAY[d.day()];
  return `${name} · ${d.format('DD/MM')}`;
}

/** Lọc "chưa xong": bỏ việc đã xong; người không còn việc nào thì bỏ luôn. */
export function unfinishedOnly(people: IWorkTodayPerson[]): IWorkTodayPerson[] {
  return people
    .map((p) => ({ ...p, items: p.items.filter((i) => i.status !== 'done') }))
    .filter((p) => p.items.length > 0);
}

/** Câu hỏi xác nhận trước khi gỡ. */
export function removeConfirmMessage(item: Pick<IWorkTodayItem, 'source' | 'title'>): string {
  const tail =
    item.source === 'work_task'
      ? 'Việc bị huỷ, người được giao không còn thấy việc này.'
      : 'Việc không hiện cho nhân viên và không tính vào ngày đó.';
  return `Gỡ "${item.title}"? ${tail} Không hoàn tác được trên app.`;
}
