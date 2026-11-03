import dayjs from 'dayjs';

import { inTab, reviewNoteError, tabForStatus, taskSubtitle } from '../work-task-review';
import { itemRoute } from '../work-today';
import type { IWorkTask } from 'src/types/hr';

// Chấm việc giao riêng trên app: việc nào ở tab nào, dòng phụ, trả lại phải có lý do, bấm việc trên thẻ "Việc giao hôm nay".

const task = (over: Partial<IWorkTask>): IWorkTask => ({
  id: 't1',
  group: 'Other',
  title: 'Xếp kệ mới',
  status: 'Assigned',
  implemented: false,
  createdAt: '2026-11-03T02:00:00Z',
  photos: [],
  ...over,
});

describe('tab của việc', () => {
  it('Chờ chấm = đã nộp; Đang làm = đang làm hoặc bị trả lại; Đã chấm = Đạt; Tất cả gồm cả việc huỷ', () => {
    expect(inTab(task({ status: 'Submitted' }), 'waiting')).toBe(true);
    expect(inTab(task({ status: 'Rejected' }), 'doing')).toBe(true);
    expect(inTab(task({ status: 'Assigned' }), 'doing')).toBe(true);
    expect(inTab(task({ status: 'Approved' }), 'done')).toBe(true);
    expect(inTab(task({ status: 'Rejected' }), 'waiting')).toBe(false);
    expect(inTab(task({ status: 'Cancelled' }), 'all')).toBe(true);
    expect(inTab(task({ status: 'Cancelled' }), 'doing')).toBe(false);
  });

  it('phiếu sáng kiến cũ không hiện ở tab nào', () => {
    expect(inTab(task({ group: 'Initiative', status: 'Submitted' }), 'waiting')).toBe(false);
    expect(inTab(task({ group: 'Initiative' }), 'all')).toBe(false);
  });

  it('mở cho một việc thì nhảy đúng tab', () => {
    expect(tabForStatus('Submitted')).toBe('waiting');
    expect(tabForStatus('Rejected')).toBe('doing');
    expect(tabForStatus('Approved')).toBe('done');
    expect(tabForStatus('Cancelled')).toBe('all');
  });
});

describe('dòng phụ', () => {
  const today = dayjs().hour(17).minute(0).second(0);

  it('người được giao, hạn, giờ nộp; nộp sau hạn ghi (trễ)', () => {
    const t = task({
      assigneeName: 'Lan',
      status: 'Submitted',
      dueAt: today.toISOString(),
      submittedAt: today.add(20, 'minute').toISOString(),
      onTime: false,
    });
    expect(taskSubtitle(t)).toBe('Lan · hạn 17:00 · nộp 17:20 (trễ)');
  });

  it('nộp đúng hạn không ghi trễ; chưa nộp mà quá hạn ghi quá hạn', () => {
    expect(
      taskSubtitle(task({ assigneeName: 'Lan', status: 'Submitted', dueAt: today.toISOString(), submittedAt: today.subtract(5, 'minute').toISOString(), onTime: true }))
    ).toBe('Lan · hạn 17:00 · nộp 16:55');
    expect(taskSubtitle(task({ assigneeName: 'Lan', late: true }))).toBe('Lan · quá hạn');
  });
});

describe('ghi chú khi chấm', () => {
  it('trả lại bắt buộc lý do, Đạt thì không', () => {
    expect(reviewNoteError(false, '  ')).not.toBeNull();
    expect(reviewNoteError(false, 'Chụp lại kệ trên')).toBeNull();
    expect(reviewNoteError(true, '')).toBeNull();
  });
});

describe('bấm việc trên thẻ "Việc giao hôm nay"', () => {
  const manager = { role: 'Manager', roles: ['Manager'], permissions: ['hr.task.manage'] } as any;
  const viewer = { role: 'Manager', roles: ['Manager'], permissions: ['inspection.read'] } as any;

  it('việc giao riêng mở Chấm việc giao cho người có quyền giao việc', () => {
    expect(itemRoute({ source: 'work_task', id: 'x' }, manager)).toEqual({ pathname: '/manage/work-tasks', params: { id: 'x' } });
    expect(itemRoute({ source: 'work_task', id: 'x' }, { role: 'Admin', roles: ['Admin'] } as any)).not.toBeNull();
  });

  it('không có quyền hoặc việc loại khác thì không mở', () => {
    expect(itemRoute({ source: 'work_task', id: 'x' }, viewer)).toBeNull();
    expect(itemRoute({ source: 'shift_work', id: 'x' }, manager)).toBeNull();
  });
});
