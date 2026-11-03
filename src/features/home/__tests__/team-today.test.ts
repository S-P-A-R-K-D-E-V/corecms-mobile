import { canSeeTeamToday, changeText, coverWindowText, groupByShift, partialCoverText } from '../team-today';
import type { ITodayBoardItem, ITodayBoardPartialCover } from 'src/types/corecms-api';

// "Nhân sự hôm nay": ai thấy thẻ, nhóm theo ca (ca Phụ sau cùng), ghi chú đổi ca / làm thay và khoảng giờ làm hộ một phần.

const user = (u: Record<string, unknown>) => ({ permissions: [], ...u }) as any;

const item = (over: Partial<ITodayBoardItem>): ITodayBoardItem => ({
  assignmentId: Math.random().toString(36).slice(2),
  staffId: 's',
  staffName: 'An',
  shiftName: 'Sáng',
  startTime: '08:30',
  endTime: '12:30',
  status: 'upcoming',
  lateMinutes: 0,
  ...over,
});

const cover = (over: Partial<ITodayBoardPartialCover>): ITodayBoardPartialCover => ({
  postId: 'p',
  staffId: 'b',
  staffName: 'Bình',
  side: 'LateArrive',
  from: null,
  to: null,
  isActual: false,
  status: 'upcoming',
  ...over,
});

describe('ai thấy "Nhân sự hôm nay"', () => {
  it('Admin, người xem chấm công hoặc xem lịch làm của mọi người thấy; nhân viên thường không', () => {
    expect(canSeeTeamToday(user({ role: 'Admin', roles: ['Admin'] }))).toBe(true);
    expect(canSeeTeamToday(user({ role: 'Manager', roles: ['Manager'], permissions: ['attendance.read'] }))).toBe(true);
    expect(canSeeTeamToday(user({ role: 'Staff', roles: ['Staff'], permissions: ['shift.assignment.read'] }))).toBe(true);
    expect(canSeeTeamToday(user({ role: 'Staff', roles: ['Staff'] }))).toBe(false);
    expect(canSeeTeamToday(null)).toBe(false);
  });
});

describe('nhóm theo ca', () => {
  it('ca chính theo giờ vào ca, ca Phụ sau cùng, giữ thứ tự trong nhóm', () => {
    const groups = groupByShift([
      item({ staffName: 'Tối 1', shiftTemplateId: 't3', shiftName: 'Tối', startTime: '18:00', endTime: '22:30', shiftType: 'Main' }),
      item({ staffName: 'Phụ 1', shiftTemplateId: 't4', shiftName: 'Phụ', startTime: '10:00', endTime: '14:00', shiftType: 'Extra' }),
      item({ staffName: 'Sáng 1', shiftTemplateId: 't1', shiftName: 'Sáng', startTime: '08:30', endTime: '12:30', shiftType: 'Main' }),
      item({ staffName: 'Chiều 1', shiftTemplateId: 't2', shiftName: 'Chiều', startTime: '12:30', endTime: '18:00', shiftType: 'Main' }),
      item({ staffName: 'Sáng 2', shiftTemplateId: 't1', shiftName: 'Sáng', startTime: '08:30', endTime: '12:30', shiftType: 'Main' }),
    ]);
    expect(groups.map((g) => g.name)).toEqual(['Sáng', 'Chiều', 'Tối', 'Phụ']);
    expect(groups[0].items.map((i) => i.staffName)).toEqual(['Sáng 1', 'Sáng 2']);
    expect(groups[3].isExtra).toBe(true);
  });

  it('core-be cũ (không có mẫu ca) nhóm theo tên ca', () => {
    const groups = groupByShift([
      item({ shiftName: 'Chiều', startTime: '12:30' }),
      item({ shiftName: 'Sáng', startTime: '08:30' }),
      item({ shiftName: 'Chiều', startTime: '12:30' }),
    ]);
    expect(groups.map((g) => [g.name, g.items.length])).toEqual([
      ['Sáng', 1],
      ['Chiều', 2],
    ]);
  });
});

describe('đổi ca / làm thay', () => {
  it('ghi người đã đổi với', () => {
    expect(changeText({ kind: 'swap', otherStaffId: 'a', otherStaffName: 'An', directed: false })).toBe('Đổi ca với An');
    expect(changeText({ kind: 'cover', otherStaffId: 'a', otherStaffName: 'An', directed: false })).toBe('Làm thay An');
    expect(changeText({ kind: 'cover', otherStaffId: 'a', otherStaffName: 'An', directed: true })).toBe('Làm thay An · quản lý xếp');
  });
});

describe('khoảng giờ làm hộ một phần', () => {
  it('đủ giờ từ chấm công thật', () => {
    expect(coverWindowText(cover({ from: '12:30', to: '13:10', isActual: true }), 'An')).toBe('12:30–13:10');
  });

  it('đi muộn, người nhờ chưa vào: tới khi người nhờ vào', () => {
    expect(coverWindowText(cover({ side: 'LateArrive', from: '12:30' }), 'An')).toBe('12:30 → khi An vào (dự kiến)');
  });

  it('giữa ca đang làm hộ: từ giờ vào', () => {
    expect(coverWindowText(cover({ side: 'MidShift', from: '13:30', isActual: true }), 'An')).toBe('từ 13:30');
  });

  it('về sớm, người nhờ chưa ra: từ khi người nhờ về tới hết ca', () => {
    expect(coverWindowText(cover({ side: 'EarlyLeave', to: '22:30' }), 'An')).toBe('khi An về → 22:30 (dự kiến)');
  });

  it('giữa ca không có giờ ước tính', () => {
    expect(coverWindowText(cover({ side: 'MidShift' }), 'An')).toBe('chưa rõ giờ');
  });

  it('dòng đầy đủ: người làm hộ · phía · giờ', () => {
    expect(partialCoverText(cover({ from: '12:30', to: '13:10', isActual: true }), 'An')).toBe('Bình làm hộ · đầu ca (đi muộn) · 12:30–13:10');
  });
});
