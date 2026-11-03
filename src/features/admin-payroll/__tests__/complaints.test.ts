import { cycleIdForComplaint, pendingByRecord, sortComplaintsForReview } from '../complaints';
import type { IPayrollComplaint } from 'src/types/hr';
import type { IPayrollCycle } from 'src/types/corecms-api';

// Hộp thư khiếu nại phiếu lương của quản lý: thứ tự cần xử lý, tìm kỳ để mở phiếu sửa, nhãn trên bảng lương kỳ.

const complaint = (c: Partial<IPayrollComplaint>): IPayrollComplaint => ({
  id: 'c',
  staffId: 's',
  staffName: 'Thu Trà',
  payrollRecordId: 'r1',
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  totalSalaryAtFiling: 1_000_000,
  content: 'Thiếu ca 12/10',
  status: 'Pending',
  replyDueOn: '2026-11-06',
  isOverdue: false,
  createdAt: '2026-11-03T02:00:00Z',
  ...c,
});

const cycle = (c: Partial<IPayrollCycle>): IPayrollCycle => ({
  id: 'k',
  name: 'Lương',
  cycleType: 'Custom',
  fromDate: '2026-10-01',
  toDate: '2026-10-31',
  standardWorkDays: 22,
  isLocked: false,
  isVisibleToStaff: true,
  createdAt: '2026-10-22T05:17:35Z',
  ...c,
});

describe('cycleIdForComplaint', () => {
  it('kỳ cùng khoảng ngày với phiếu; trùng ngày thì ưu tiên kỳ đang gửi cho nhân viên', () => {
    const cycles = [
      cycle({ id: 'aug-draft', fromDate: '2026-08-01', toDate: '2026-08-31', isVisibleToStaff: false }),
      cycle({ id: 'aug', fromDate: '2026-08-01', toDate: '2026-08-31' }),
      cycle({ id: 'oct' }),
    ];
    expect(cycleIdForComplaint(cycles, complaint({}))).toBe('oct');
    expect(cycleIdForComplaint(cycles, complaint({ fromDate: '2026-08-01T00:00:00', toDate: '2026-08-31' }))).toBe('aug');
  });

  it('không có kỳ khớp hoặc chưa tải kỳ → undefined (màn phiếu vẫn mở, chỉ thiếu thẻ số tiền)', () => {
    expect(cycleIdForComplaint([cycle({ fromDate: '2026-09-01', toDate: '2026-09-30' })], complaint({}))).toBeUndefined();
    expect(cycleIdForComplaint(undefined, complaint({}))).toBeUndefined();
  });
});

describe('sortComplaintsForReview', () => {
  it('quá hạn trước, rồi chờ theo hạn gần nhất, cuối cùng đã xong mới nhất trước', () => {
    const list = [
      complaint({ id: 'done-old', status: 'Rejected', createdAt: '2026-10-01T00:00:00Z' }),
      complaint({ id: 'due-7', replyDueOn: '2026-11-07' }),
      complaint({ id: 'done-new', status: 'Accepted', createdAt: '2026-11-02T00:00:00Z' }),
      complaint({ id: 'overdue', replyDueOn: '2026-11-02', isOverdue: true }),
      complaint({ id: 'due-5', replyDueOn: '2026-11-05' }),
    ];
    expect(sortComplaintsForReview(list).map((c) => c.id)).toEqual(['overdue', 'due-5', 'due-7', 'done-new', 'done-old']);
    expect(list[0].id).toBe('done-old'); // không đổi mảng gốc
  });
});

describe('pendingByRecord', () => {
  it('chỉ đếm khiếu nại còn chờ, theo phiếu', () => {
    const map = pendingByRecord([
      complaint({ id: '1', payrollRecordId: 'a' }),
      complaint({ id: '2', payrollRecordId: 'a', status: 'Withdrawn' }),
      complaint({ id: '3', payrollRecordId: 'b', status: 'Accepted' }),
    ]);
    expect(map.get('a')).toBe(1);
    expect(map.has('b')).toBe(false);
    expect(pendingByRecord(undefined).size).toBe(0);
  });
});
