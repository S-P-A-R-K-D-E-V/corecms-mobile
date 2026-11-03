import type { IPayrollCycle } from 'src/types/corecms-api';
import type { IPayrollComplaint } from 'src/types/hr';

// ----------------------------------------------------------------------
// Khiếu nại phiếu lương phía quản lý (phần thuần, test được): thứ tự hộp thư và tìm kỳ lương của phiếu để mở màn sửa.
// ----------------------------------------------------------------------

const day = (s: string) => s.slice(0, 10);

/**
 * Kỳ lương chứa phiếu bị khiếu nại — khiếu nại chỉ giữ ngày của phiếu, không giữ kỳ. Cùng khoảng ngày có thể có nhiều kỳ
 * (kỳ nháp ẩn với nhân viên): nhân viên chỉ khiếu nại được phiếu của kỳ đã gửi, nên ưu tiên kỳ đang hiện cho nhân viên.
 */
export function cycleIdForComplaint(
  cycles: readonly IPayrollCycle[] | undefined,
  c: Pick<IPayrollComplaint, 'fromDate' | 'toDate'>
): string | undefined {
  const same = (cycles ?? []).filter((x) => day(x.fromDate) === day(c.fromDate) && day(x.toDate) === day(c.toDate));
  return (same.find((x) => x.isVisibleToStaff) ?? same[0])?.id;
}

/** Hộp thư: chờ trả lời lên đầu (quá hạn trước, rồi hạn gần nhất), sau đó khiếu nại đã xong, mới nhất trước. */
export function sortComplaintsForReview(list: readonly IPayrollComplaint[]): IPayrollComplaint[] {
  const rank = (c: IPayrollComplaint) => (c.status !== 'Pending' ? 2 : c.isOverdue ? 0 : 1);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.status === 'Pending') return day(a.replyDueOn).localeCompare(day(b.replyDueOn)) || a.createdAt.localeCompare(b.createdAt);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Số khiếu nại chờ trả lời theo từng phiếu lương (để gắn nhãn trên bảng lương của kỳ). */
export function pendingByRecord(list: readonly IPayrollComplaint[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of list ?? []) {
    if (c.status === 'Pending') map.set(c.payrollRecordId, (map.get(c.payrollRecordId) ?? 0) + 1);
  }
  return map;
}
