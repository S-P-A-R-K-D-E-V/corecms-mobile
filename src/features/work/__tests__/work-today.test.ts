import dayjs from 'dayjs';

import { canSeeWorkToday, donePct, itemSubtitle, progressText } from '../work-today';
import type { IWorkTodayItem } from 'src/types/hr';

// "Việc giao hôm nay": ai thấy thẻ, tiến độ từng người, dòng phụ của từng việc.

const user = (u: Record<string, unknown>) => ({ permissions: [], ...u }) as any;

const item = (over: Partial<IWorkTodayItem>): IWorkTodayItem => ({
  source: 'work_task',
  id: '1',
  title: 'Xếp kho',
  status: 'pending',
  ...over,
});

describe('ai thấy "Việc giao hôm nay"', () => {
  it('Admin, người giao việc, xem lượt kiểm hoặc xem việc vệ sinh thấy; nhân viên thường không', () => {
    expect(canSeeWorkToday(user({ role: 'Admin', roles: ['Admin'] }))).toBe(true);
    expect(canSeeWorkToday(user({ role: 'Manager', roles: ['Manager'], permissions: ['hr.task.manage'] }))).toBe(true);
    expect(canSeeWorkToday(user({ role: 'Staff', roles: ['Staff'], permissions: ['inspection.read'] }))).toBe(true);
    expect(canSeeWorkToday(user({ role: 'Staff', roles: ['Staff'], permissions: ['cleaning.read'] }))).toBe(true);
    expect(canSeeWorkToday(user({ role: 'Staff', roles: ['Staff'] }))).toBe(false);
    expect(canSeeWorkToday(null)).toBe(false);
  });
});

describe('tiến độ một người', () => {
  it('phần trăm xong và dòng tóm tắt', () => {
    expect(donePct({ done: 3, total: 5 })).toBe(60);
    expect(donePct({ done: 0, total: 0 })).toBe(0);
    expect(progressText({ done: 3, total: 5, overdue: 0 })).toBe('3/5 xong');
    expect(progressText({ done: 1, total: 4, overdue: 2 })).toBe('1/4 xong · 2 quá hạn');
  });
});

describe('dòng phụ của một việc', () => {
  it('việc đã xong ghi giờ xong và người làm', () => {
    const doneAt = dayjs().hour(9).minute(5).toISOString();
    expect(itemSubtitle(item({ source: 'shift_work', context: 'Ca Sáng', status: 'done', doneAt, doneByName: 'Minh' }))).toBe(
      'Việc trong ca · Ca Sáng · xong 09:05 (Minh)'
    );
  });

  it('việc chưa xong ghi hạn: cùng ngày chỉ giờ, khác ngày kèm ngày', () => {
    const today = dayjs().hour(17).minute(0);
    expect(itemSubtitle(item({ dueAt: today.toISOString() }))).toBe('Giao riêng · hạn 17:00');
    const earlier = dayjs().subtract(2, 'day').hour(8).minute(30);
    expect(itemSubtitle(item({ status: 'overdue', context: 'Bị trả lại', dueAt: earlier.toISOString() }))).toBe(
      `Giao riêng · Bị trả lại · hạn 08:30 ${earlier.format('DD/MM')}`
    );
  });

  it('việc vệ sinh không có hạn', () => {
    expect(itemSubtitle(item({ source: 'cleaning', context: 'Ca tối · Tầng 1' }))).toBe('Vệ sinh · Ca tối · Tầng 1');
  });
});
