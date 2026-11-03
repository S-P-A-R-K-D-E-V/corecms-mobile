import dayjs from 'dayjs';

import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasAnyPermission } from 'src/auth/permissions';
import type { IWorkTodayItem, IWorkTodayPerson, WorkTodaySource, WorkTodayStatus } from 'src/types/hr';

// ----------------------------------------------------------------------
// "Việc giao hôm nay" trên dashboard chủ / quản lý (phần thuần, test được): ai thấy thẻ, nhãn trạng thái, dòng tiến độ của
// từng người. Số liệu lấy nguyên từ GET /work-today.
// ----------------------------------------------------------------------

/** Ai thấy thẻ — khớp quyền của GET /work-today. */
export function canSeeWorkToday(user: AuthUser | null | undefined): boolean {
  return hasAnyPermission(user, [PERMISSIONS.hr.taskManage, PERMISSIONS.inspection.read, PERMISSIONS.cleaning.read]);
}

export const WORK_STATUS: Record<WorkTodayStatus, { label: string; tone: 'success' | 'info' | 'neutral' | 'error' | 'warning' }> = {
  done: { label: 'Xong', tone: 'success' },
  waiting_review: { label: 'Chờ chấm', tone: 'info' },
  pending: { label: 'Chưa xong', tone: 'neutral' },
  overdue: { label: 'Quá hạn', tone: 'error' },
  failed: { label: 'Không đạt', tone: 'error' },
};

export const WORK_SOURCE: Record<WorkTodaySource, string> = {
  shift_work: 'Việc trong ca',
  cleaning: 'Vệ sinh',
  work_task: 'Giao riêng',
};

/** % việc đã xong (kể cả chờ chấm) của một người, làm tròn; không có việc → 0. */
export function donePct(p: Pick<IWorkTodayPerson, 'done' | 'total'>): number {
  return p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
}

/** "3/5 xong · 1 quá hạn". */
export function progressText(p: Pick<IWorkTodayPerson, 'done' | 'total' | 'overdue'>): string {
  const base = `${p.done}/${p.total} xong`;
  return p.overdue > 0 ? `${base} · ${p.overdue} quá hạn` : base;
}

/** Dòng phụ của một việc: nguồn · ca/khu · hạn hoặc giờ xong. */
export function itemSubtitle(item: IWorkTodayItem): string {
  const parts = [WORK_SOURCE[item.source] ?? item.source, item.context];
  if (item.doneAt && (item.status === 'done' || item.status === 'waiting_review')) {
    parts.push(`xong ${dayjs(item.doneAt).format('HH:mm')}${item.doneByName ? ` (${item.doneByName})` : ''}`);
  } else if (item.dueAt) {
    const due = dayjs(item.dueAt);
    parts.push(`hạn ${due.isSame(dayjs(), 'day') ? due.format('HH:mm') : due.format('HH:mm DD/MM')}`);
  }
  return parts.filter(Boolean).join(' · ');
}
