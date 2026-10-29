import { shiftWorkStatus, todayWorkRows } from '../work-rows';
import { canDoItem } from '../ShiftWorkSection';
import { isCorrectiveOverdue } from '../CorrectiveActionsSection';

// Công việc: trạng thái hạng mục tự làm (kết quả kiểm có trước), gộp với việc theo lịch cũ cho thẻ trang chủ; làm lại chỉ
// khi chưa kiểm và không phải ngày sau; sửa tận gốc quá hạn theo ngày.

jest.mock('src/api/inspection', () => ({}));
jest.mock('src/features/inspection/inspection-photos', () => ({}));
jest.mock('src/features/inspection/inspection-ui', () => ({}));

const item = (over: Record<string, unknown> = {}) =>
  ({
    itemId: 'i1',
    code: 'V01',
    groupName: 'Việc theo ca',
    title: 'Lau kính mặt tiền',
    passCriteria: 'Kính không vệt',
    zones: ['A'],
    requiresPhoto: true,
    completion: null,
    outcome: null,
    ...over,
  }) as any;

const completion = { id: 'c1', completedByUserId: 'u1', completedByName: 'Lan', completedAt: '2026-10-29T03:00:00Z', note: null, photos: [] };

describe('shiftWorkStatus', () => {
  it('chưa làm → Pending; đã gửi ảnh → Done; kiểm Đạt / Không đạt thắng', () => {
    expect(shiftWorkStatus(item())).toBe('Pending');
    expect(shiftWorkStatus(item({ completion }))).toBe('Done');
    expect(shiftWorkStatus(item({ completion, outcome: 'Pass' }))).toBe('Passed');
    expect(shiftWorkStatus(item({ outcome: 'Fail' }))).toBe('Failed');
    expect(shiftWorkStatus(item({ outcome: 'NotApplicable' }))).toBe('Done');
  });
});

describe('todayWorkRows', () => {
  it('gộp hạng mục tự làm và việc theo lịch cũ', () => {
    const rows = todayWorkRows(
      [{ date: '2026-10-29', shiftScheduleId: 's1', shiftName: 'Ca sáng', startTime: '08:00', endTime: '14:00', block: 'Morning', items: [item()] }],
      [{ shiftAssignmentId: 'a1', shiftName: 'Ca sáng', cleaningBlock: 'Morning', tasks: [{ id: 't1', name: 'Quét sàn', area: 'Tầng 1', status: 'Done' } as any] }]
    );
    expect(rows).toEqual([
      { id: 's1:i1', name: 'Lau kính mặt tiền', area: 'Khu A', status: 'Pending' },
      { id: 't1', name: 'Quét sàn', area: 'Tầng 1', status: 'Done' },
    ]);
    expect(todayWorkRows(undefined, undefined)).toEqual([]);
  });
});

describe('canDoItem', () => {
  it('làm / làm lại khi ca chưa kiểm hạng mục và không phải ngày sau', () => {
    expect(canDoItem(item(), '2026-10-29', '2026-10-29')).toBe(true);
    expect(canDoItem(item({ completion }), '2026-10-28', '2026-10-29')).toBe(true);
    expect(canDoItem(item({ outcome: 'Pass' }), '2026-10-29', '2026-10-29')).toBe(false);
    expect(canDoItem(item(), '2026-10-30', '2026-10-29')).toBe(false);
  });
});

describe('isCorrectiveOverdue', () => {
  it('quá hạn khi hạn trước hôm nay; không có hạn thì không', () => {
    const base = { id: 'a', title: 'Thêm kệ', status: 'Open' } as any;
    expect(isCorrectiveOverdue({ ...base, dueDate: '2026-10-28' }, '2026-10-29')).toBe(true);
    expect(isCorrectiveOverdue({ ...base, dueDate: '2026-10-29' }, '2026-10-29')).toBe(false);
    expect(isCorrectiveOverdue({ ...base, dueDate: null }, '2026-10-29')).toBe(false);
  });
});
