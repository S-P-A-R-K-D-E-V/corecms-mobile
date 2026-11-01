import { isOverdue } from '../AssignedTasksSection';

// Nộp việc giao riêng quá hạn: app hỏi lý do trễ (quy chế: trễ không ghi lý do trừ 2 điểm).
describe('isOverdue', () => {
  const now = new Date('2026-11-03T10:00:00Z').getTime();

  it('quá hạn, chưa nộp → hỏi lý do', () => {
    expect(isOverdue({ dueAt: '2026-11-02T10:00:00Z', submittedAt: null }, now)).toBe(true);
  });

  it('còn hạn, không hạn, hoặc đã nộp lần đầu đúng hạn → không hỏi', () => {
    expect(isOverdue({ dueAt: '2026-11-04T10:00:00Z', submittedAt: null }, now)).toBe(false);
    expect(isOverdue({ dueAt: null, submittedAt: null }, now)).toBe(false);
    expect(isOverdue({ dueAt: '2026-11-02T10:00:00Z', submittedAt: '2026-11-02T09:00:00Z', late: false }, now)).toBe(false);
  });

  it('backend báo trễ (nộp lại sau khi bị trả) → hỏi lý do', () => {
    expect(isOverdue({ dueAt: '2026-11-02T10:00:00Z', submittedAt: '2026-11-02T12:00:00Z', late: true }, now)).toBe(true);
    expect(isOverdue(null, now)).toBe(false);
  });
});
