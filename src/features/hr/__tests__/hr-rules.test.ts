import dayjs from 'dayjs';

import {
  canRequestReview,
  changedCounts,
  fCompactVnd,
  fVnd,
  hoursUntilShift,
  leaveCandidates,
  parseCount,
  slotTargetFor,
  monthOf,
  bonusText,
  canComplain,
  rankScores,
} from '../hr-rules';
import type { IMyScheduleItem } from 'src/types/corecms-api';
import type { ISalesTarget, IStaffPerformanceScore, IViolationEntry } from 'src/types/hr';

// Phần thuần của các màn Nhân sự: luật báo trước 24 giờ (Nội quy Điều 7), ca xin nghỉ được, target một ca (Quy chế Điều
// 9), hạn đề nghị xem xét lại (Điều 20).

const item = (over: Partial<IMyScheduleItem> = {}): IMyScheduleItem => ({
  assignmentId: 'a1',
  shiftScheduleId: 's1',
  shiftName: 'Ca Tối',
  shiftType: 'Main',
  date: '2026-11-02',
  startTime: '18:00',
  endTime: '22:30',
  totalHours: 4.5,
  checkInAllowedMinutesBefore: 15,
  hasCheckedIn: false,
  hasCheckedOut: false,
  ...over,
});

describe('xin nghỉ ca', () => {
  it('đếm giờ tới giờ vào ca', () => {
    expect(hoursUntilShift('2026-11-02', '18:00', dayjs('2026-11-01T18:00:00'))).toBe(24);
    expect(hoursUntilShift('2026-11-02', '18:00', dayjs('2026-11-02T08:00:00'))).toBe(10);
  });

  it('chỉ ca sắp tới chưa chấm công, sắp theo giờ', () => {
    const now = dayjs('2026-11-02T12:00:00');
    const list = leaveCandidates(
      [
        item({ assignmentId: 'late', date: '2026-11-03', startTime: '08:30' }),
        item({ assignmentId: 'past', date: '2026-11-02', startTime: '08:30' }),
        item({ assignmentId: 'checked', hasCheckedIn: true }),
        item({ assignmentId: 'tonight' }),
      ],
      now
    );
    expect(list.map((s) => s.assignmentId)).toEqual(['tonight', 'late']);
  });
});

describe('target ca', () => {
  const targets: ISalesTarget[] = [
    {
      weekStart: '2026-11-02',
      targetAmount: 30_000_000,
      slots: [
        { weekday: 1, date: '2026-11-02', shiftScheduleId: 's1', shiftName: 'Ca Tối', start: '18:00:00', end: '22:30:00', share: 0.1, target: 3_150_000 },
      ],
    },
  ];

  it('khớp theo lịch ca, hoặc theo giờ vào khi lịch ca đổi phiên bản', () => {
    expect(slotTargetFor(targets, '2026-11-02', 's1')?.target).toBe(3_150_000);
    expect(slotTargetFor(targets, '2026-11-02', 's-new', '18:00')?.target).toBe(3_150_000);
    expect(slotTargetFor(targets, '2026-11-03', 's1')).toBeNull();
  });

  it('định dạng tiền', () => {
    expect(fVnd(3_150_000)).toBe('3.150.000đ');
    expect(fCompactVnd(3_150_000)).toBe('3,2tr');
    expect(fCompactVnd(850_000)).toBe('850k');
  });
});

describe('đề nghị xem xét lại', () => {
  const now = dayjs('2026-12-05T10:00:00');
  it('còn hạn và chưa gửi thì được gửi', () => {
    expect(canRequestReview('2026-12-07T17:00:00Z', null, now)).toBe(true);
    expect(canRequestReview('2026-12-04T17:00:00Z', null, now)).toBe(false);
    expect(canRequestReview('2026-12-07T17:00:00Z', '2026-12-05T01:00:00Z', now)).toBe(false);
  });
});

describe('nội dung hợp đồng trên app', () => {
  it('bỏ dấu định dạng in', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readableBody } = require('../HrContractsScreen');
    const text = readableBody('Điều 9. Thi hành\n[[NGAT_TRANG]]\n[[CHU_KY]]');
    expect(text).not.toContain('[[');
    expect(text).toContain('NGƯỜI SỬ DỤNG LAO ĐỘNG');
  });
});

describe('kiểm hàng ca: số đếm', () => {
  it('ô trống = xoá số đếm, dấu phẩy thập phân, số âm / chữ là sai', () => {
    expect(parseCount('')).toBeNull();
    expect(parseCount(' 4 ')).toBe(4);
    expect(parseCount('1,5')).toBe(1.5);
    expect(parseCount('-1')).toBeUndefined();
    expect(parseCount('abc')).toBeUndefined();
  });

  it('chỉ gửi dòng có ô nhập khác số đã lưu', () => {
    const lines = [
      { lineId: 'a', countedQuantity: 4 },
      { lineId: 'b', countedQuantity: null },
      { lineId: 'c', countedQuantity: 2 },
    ];
    expect(changedCounts(lines, { a: '4', b: '3', c: '' })).toEqual([
      { lineId: 'b', quantity: 3 },
      { lineId: 'c', quantity: null },
    ]);
  });
});

// Vi phạm & điểm trừ: mức thưởng tuần theo tổng điểm trừ, hạn khiếu nại.
describe('điểm trừ', () => {
  const entry = (over: Partial<IViolationEntry> = {}): IViolationEntry => ({
    id: 'e1',
    userId: 'lan',
    fullName: 'Lan',
    occurredOn: '2026-11-02',
    quantity: 1,
    points: 4,
    ruleName: 'Đi muộn trên 15 phút',
    groupName: 'Giờ giấc',
    component: 'Discipline',
    losesWeeklyBonus: false,
    losesMonthlyBonus: false,
    isAuto: true,
    status: 'Active',
    complaintDeadline: '2026-11-06',
    ...over,
  });

  it('monthOf lấy ngày đầu tháng', () => {
    expect(monthOf(dayjs('2026-11-17'))).toBe('2026-11-01');
  });

  it('bonusText theo ngưỡng; không đặt ngưỡng thì không hiện', () => {
    expect(bonusText({ weeklyBonusPct: null, notComplete: false, losesMonthlyBonus: false })).toBeNull();
    expect(bonusText({ weeklyBonusPct: 100, notComplete: false, losesMonthlyBonus: false })).toBe('Nhận đủ thưởng tuần');
    expect(bonusText({ weeklyBonusPct: 50, notComplete: false, losesMonthlyBonus: false })).toBe('Nhận 50% thưởng tuần');
    expect(bonusText({ weeklyBonusPct: 0, notComplete: true, losesMonthlyBonus: false })).toBe('Không nhận thưởng · Không hoàn thành');
  });

  it('canComplain: đang tính, chưa khiếu nại, trong hạn', () => {
    expect(canComplain(entry(), '2026-11-06')).toBe(true);
    expect(canComplain(entry(), '2026-11-07')).toBe(false);
    expect(canComplain(entry({ complaintDeadline: null }), '2027-01-01')).toBe(true);
    expect(canComplain(entry({ complainedAt: '2026-11-03T00:00:00Z' }), '2026-11-04')).toBe(false);
    expect(canComplain(entry({ status: 'Cancelled' }), '2026-11-04')).toBe(false);
  });
});

describe('rankScores', () => {
  const score = (id: string, total: number, over: Partial<IStaffPerformanceScore> = {}) =>
    ({ id, total, shiftCount: 12, isDefaultScore: false, ...over }) as IStaffPerformanceScore;

  it('xếp theo điểm, bằng điểm cùng hạng, người chưa có ca hoặc điểm mặc định không có hạng', () => {
    const rows = rankScores([
      score('moi', 90, { isDefaultScore: true }),
      score('b', 80),
      score('a', 85),
      score('c', 80),
      score('d', 60),
      score('khongca', 95, { shiftCount: 0 }),
    ]);

    expect(rows.map((r) => [r.score.id, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 2],
      ['d', 4],
      ['moi', null],
      ['khongca', null],
    ]);
  });
});
