import dayjs from 'dayjs';

import { canQuickCheck, shiftNeedingMyQuickCheck } from '../inspection-access';
import type { IInspectionShift } from 'src/types/inspection';

// Ai bấm được "Kiểm nhanh" — khớp core-be StartInspection (làm trong ca + trưởng ca hoặc inspection.conduct) — và
// khi nào trang chủ hiện thẻ "Kiểm nhanh ca này" cho trưởng ca.

const shift = (over: Partial<IInspectionShift> = {}): IInspectionShift => ({
  date: '2026-11-02',
  shiftScheduleId: 's1',
  shiftName: 'Tối',
  startTime: '18:00',
  endTime: '22:30',
  shiftType: 'Main',
  branchId: null,
  staffCount: 3,
  shiftLeadId: 'lan',
  shiftLeadName: 'Lan',
  iAmOnShift: true,
  iAmShiftLead: true,
  quickInspectionId: null,
  quickStatus: null,
  spotChecks: 0,
  ...over,
});

describe('canQuickCheck', () => {
  it('trưởng ca trong ca: được; người trong ca không phải trưởng ca: cần inspection.conduct', () => {
    expect(canQuickCheck(shift(), false)).toBe(true);
    expect(canQuickCheck(shift({ iAmShiftLead: false }), false)).toBe(false);
    expect(canQuickCheck(shift({ iAmShiftLead: false }), true)).toBe(true);
  });

  it('không làm trong ca thì không kiểm nhanh được, kể cả có quyền (chỉ kiểm đột xuất)', () => {
    expect(canQuickCheck(shift({ iAmOnShift: false, iAmShiftLead: false }), true)).toBe(false);
  });
});

describe('shiftNeedingMyQuickCheck', () => {
  const at = (hm: string, date = '2026-11-02') => dayjs(`${date} ${hm}`);

  it('hiện từ 30 phút trước giờ vào tới giờ ra, khi chưa nộp', () => {
    expect(shiftNeedingMyQuickCheck([shift()], at('17:20'))).toBeNull();
    expect(shiftNeedingMyQuickCheck([shift()], at('17:35'))?.shiftScheduleId).toBe('s1');
    expect(shiftNeedingMyQuickCheck([shift({ quickInspectionId: 'i1', quickStatus: 'Draft' })], at('20:00'))?.quickInspectionId).toBe('i1');
    expect(shiftNeedingMyQuickCheck([shift({ quickStatus: 'Submitted' })], at('20:00'))).toBeNull();
    expect(shiftNeedingMyQuickCheck([shift()], at('22:31'))).toBeNull();
  });

  it('chỉ cho trưởng ca của ca chính đang làm trong ca', () => {
    expect(shiftNeedingMyQuickCheck([shift({ iAmShiftLead: false })], at('20:00'))).toBeNull();
    expect(shiftNeedingMyQuickCheck([shift({ iAmOnShift: false })], at('20:00'))).toBeNull();
    expect(shiftNeedingMyQuickCheck([shift({ shiftType: 'Extra' })], at('20:00'))).toBeNull();
  });

  it('ca qua đêm: giờ ra tính sang ngày hôm sau', () => {
    const night = shift({ startTime: '22:00', endTime: '06:00' });
    expect(shiftNeedingMyQuickCheck([night], at('02:00', '2026-11-03'))).not.toBeNull();
    expect(shiftNeedingMyQuickCheck([night], at('06:30', '2026-11-03'))).toBeNull();
  });
});
