import { canManageAny, dayLabel, itemActions, removeConfirmMessage, unfinishedOnly } from '../work-day';
import type { IWorkTodayItem, IWorkTodayPerson } from 'src/types/hr';

// Việc theo ngày: việc nào đánh dấu xong / gỡ được theo quyền + trạng thái, nhãn ngày, lọc "chưa xong".

const TODAY = '2026-11-04';
const admin = { role: 'Admin', roles: ['Admin'] } as any;
const lead = { role: 'Manager', roles: ['Manager'], permissions: ['inspection.manage', 'inspection.read'] } as any;
const viewer = { role: 'Manager', roles: ['Manager'], permissions: ['cleaning.read'] } as any;

const item = (over: Partial<IWorkTodayItem>): IWorkTodayItem => ({
  source: 'work_task',
  id: 'x',
  title: 'Lên kệ hàng nhập',
  status: 'pending',
  ...over,
});

describe('việc nào đánh dấu xong / gỡ được', () => {
  it('chưa xong / quá hạn / chờ chấm: cả hai; đã xong: không gì', () => {
    expect(itemActions(item({ status: 'overdue' }), TODAY, admin, TODAY)).toEqual(['done', 'remove']);
    expect(itemActions(item({ status: 'waiting_review', source: 'cleaning' }), TODAY, admin, TODAY)).toEqual(['done', 'remove']);
    expect(itemActions(item({ status: 'done' }), TODAY, admin, TODAY)).toEqual([]);
  });

  it('việc trong ca: Không đạt (ca đã chấm) không đổi được; ngày chưa tới chỉ gỡ; thiếu ca thì không gì', () => {
    const sw = (over: Partial<IWorkTodayItem>) => item({ source: 'shift_work', shiftScheduleId: 's1', branchKey: null, ...over });
    expect(itemActions(sw({}), TODAY, lead, TODAY)).toEqual(['done', 'remove']);
    expect(itemActions(sw({ status: 'failed' }), TODAY, lead, TODAY)).toEqual([]);
    expect(itemActions(sw({}), '2026-11-05', lead, TODAY)).toEqual(['remove']);
    expect(itemActions(sw({ shiftScheduleId: null }), TODAY, lead, TODAY)).toEqual([]);
  });

  it('theo quyền của từng loại việc', () => {
    expect(itemActions(item({ source: 'shift_work', shiftScheduleId: 's1' }), TODAY, lead, TODAY)).not.toEqual([]);
    expect(itemActions(item({ source: 'work_task' }), TODAY, lead, TODAY)).toEqual([]);
    expect(itemActions(item({ source: 'cleaning' }), TODAY, viewer, TODAY)).toEqual([]);
    expect(canManageAny(viewer)).toBe(false);
    expect(canManageAny(lead)).toBe(true);
  });
});

describe('nhãn ngày', () => {
  it('hôm nay / hôm qua / ngày mai, còn lại thứ', () => {
    expect(dayLabel('2026-11-04', TODAY)).toBe('Hôm nay · 04/11');
    expect(dayLabel('2026-11-03', TODAY)).toBe('Hôm qua · 03/11');
    expect(dayLabel('2026-11-05', TODAY)).toBe('Ngày mai · 05/11');
    expect(dayLabel('2026-11-07', TODAY)).toBe('T7 · 07/11');
    expect(dayLabel('2026-11-08', TODAY)).toBe('CN · 08/11');
  });
});

describe('lọc chưa xong', () => {
  it('bỏ việc đã xong và người không còn việc', () => {
    const person = (name: string, statuses: IWorkTodayItem['status'][]): IWorkTodayPerson => ({
      staffId: name, staffName: name, total: statuses.length, done: 0, pending: 0, overdue: 0,
      items: statuses.map((status, i) => item({ id: `${name}${i}`, status })),
    });

    const open = unfinishedOnly([person('Lan', ['done', 'overdue']), person('An', ['done'])]);

    expect(open.map((p) => p.staffName)).toEqual(['Lan']);
    expect(open[0].items.map((i) => i.status)).toEqual(['overdue']);
  });
});

describe('xác nhận gỡ', () => {
  it('việc giao riêng nói rõ là huỷ; loại khác nói không tính', () => {
    expect(removeConfirmMessage(item({}))).toContain('huỷ');
    expect(removeConfirmMessage(item({ source: 'cleaning', title: 'Lau sàn' }))).toContain('không tính');
  });
});
