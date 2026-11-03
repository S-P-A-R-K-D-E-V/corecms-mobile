import dayjs from 'dayjs';

import type { IWorkTask } from 'src/types/hr';

// ----------------------------------------------------------------------
// Chấm việc giao riêng (quản lý, hr.task.manage) — phần thuần, test được: nhóm lọc, dòng phụ, kiểm ghi chú khi trả lại.
// Tab "Chờ chấm" lấy mọi việc đã nộp (không lọc tháng: việc giao tháng trước nộp tháng này vẫn hiện); các tab khác lọc theo
// tháng giao như web.
// ----------------------------------------------------------------------

export type ReviewTab = 'waiting' | 'doing' | 'done' | 'all';

export const REVIEW_TABS: { key: ReviewTab; label: string }[] = [
  { key: 'waiting', label: 'Chờ chấm' },
  { key: 'doing', label: 'Đang làm' },
  { key: 'done', label: 'Đã chấm' },
  { key: 'all', label: 'Tất cả' },
];

/** Việc thuộc tab nào (Đã chấm = Đạt; việc bị trả lại đang chờ nộp lại nên ở Đang làm). Phiếu sáng kiến cũ không hiện. */
export function inTab(task: Pick<IWorkTask, 'status' | 'group'>, tab: ReviewTab): boolean {
  if (task.group === 'Initiative') return false;
  switch (tab) {
    case 'waiting':
      return task.status === 'Submitted';
    case 'doing':
      return task.status === 'Assigned' || task.status === 'Rejected';
    case 'done':
      return task.status === 'Approved';
    default:
      return true;
  }
}

/** Tab mở sẵn khi vào từ thẻ "Việc giao hôm nay" / thông báo cho một việc. */
export function tabForStatus(status: IWorkTask['status']): ReviewTab {
  if (status === 'Submitted') return 'waiting';
  if (status === 'Assigned' || status === 'Rejected') return 'doing';
  if (status === 'Approved') return 'done';
  return 'all';
}

function when(iso: string): string {
  const d = dayjs(iso);
  return d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.format('HH:mm DD/MM');
}

/** "Nguyễn A · hạn 17:00 · nộp 16:40 (trễ)". */
export function taskSubtitle(task: IWorkTask): string {
  const parts: string[] = [];
  if (task.assigneeName) parts.push(task.assigneeName);
  if (task.dueAt) parts.push(`hạn ${when(task.dueAt)}`);
  if (task.submittedAt && task.status !== 'Assigned') {
    const late = task.onTime === false || (task.dueAt != null && dayjs(task.submittedAt).isAfter(task.dueAt));
    parts.push(`nộp ${when(task.submittedAt)}${late ? ' (trễ)' : ''}`);
  } else if (task.late) {
    parts.push('quá hạn');
  }
  return parts.join(' · ');
}

/** Lỗi của ghi chú khi chấm; null = gửi được. Trả lại bắt buộc ghi lý do (core-be cũng kiểm). */
export function reviewNoteError(approve: boolean, note: string): string | null {
  if (!approve && note.trim().length === 0) return 'Ghi lý do trả lại để nhân viên biết cần làm lại gì.';
  return null;
}
