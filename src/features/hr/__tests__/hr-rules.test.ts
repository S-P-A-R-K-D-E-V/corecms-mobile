import dayjs from 'dayjs';

import { canRequestReview, fCompactVnd, fVnd, hoursUntilShift, leaveCandidates, slotTargetFor } from '../hr-rules';
import type { IMyScheduleItem } from 'src/types/corecms-api';
import type { ISalesTarget } from 'src/types/hr';

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
