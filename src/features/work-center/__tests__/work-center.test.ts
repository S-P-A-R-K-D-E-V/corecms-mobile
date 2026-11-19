import dayjs from 'dayjs';

import type { AgentTaskView } from 'src/api/agent-center';
import { normalizeWorkHubItem } from 'src/api/work-hub';

import {
  agentColumn,
  buildWorkCenter,
  canSeeWorkCenter,
  entryMeta,
  filterKind,
  fromAgentTask,
  fromHubItem,
  workEntryRoute,
  workSources,
} from '../work-center';

const user = (u: Record<string, unknown>) => ({ permissions: [], ...u }) as any;
const NOW = dayjs('2026-11-19T15:00:00').valueOf();
const at = (s: string) => dayjs(s).toISOString();

const agent = (over: Partial<AgentTaskView>): AgentTaskView =>
  ({
    id: '3f9a1c22-0000-0000-0000-000000000000',
    agentName: 'Kho – Thu chi',
    title: 'Đối soát cuối ngày',
    status: 'running',
    createdAt: at('2026-11-19T14:00:00'),
    startedAt: at('2026-11-19T14:00:05'),
    finishedAt: null,
    error: null,
    currentStepLabel: 'Bước 2/4',
    ...over,
  }) as AgentTaskView;

const hub = (over: Record<string, unknown>) =>
  fromHubItem(
    normalizeWorkHubItem({
      kind: 'work',
      id: 'w1',
      code: 'CV-E3694C',
      title: 'Chụp ảnh 7 món',
      column: 'queued',
      status: 'Assigned',
      statusLabel: 'Đã giao',
      assigneeName: 'An Xing',
      createdAt: at('2026-11-19T08:00:00'),
      sortAt: at('2026-11-19T08:00:00'),
      ...over,
    })
  );

describe('work-center', () => {
  it('chỉ người có quyền agent / chấm việc giao / chấm vệ sinh thấy, mỗi nguồn theo quyền riêng', () => {
    expect(canSeeWorkCenter(user({ role: 'Admin', roles: ['Admin'] }))).toBe(true);
    expect(canSeeWorkCenter(user({ role: 'Manager', roles: ['Manager'], permissions: ['hr.task.manage'] }))).toBe(true);
    expect(canSeeWorkCenter(user({ role: 'Staff', roles: ['Staff'], permissions: ['cleaning.read'] }))).toBe(false);
    expect(workSources(user({ role: 'Manager', roles: ['Manager'], permissions: ['cleaning.review'] }))).toEqual({
      agent: false,
      work: false,
      cleaning: true,
    });
  });

  it('trạng thái agent quy về cột chung, mã AG- từ id', () => {
    expect(agentColumn('waiting_approval')).toBe('waiting');
    expect(agentColumn('waiting_children')).toBe('running');
    expect(agentColumn('stopped')).toBe('ended');
    expect(agentColumn('mới-lạ')).toBe('running');
    const e = fromAgentTask(agent({ status: 'failed', error: 'Hết ngân sách', finishedAt: at('2026-11-19T14:01:00') }));
    expect(e.code).toBe('AG-3F9A1C');
    expect(e.note).toBe('Hết ngân sách');
    expect(e.open).toBe(false);
  });

  it('chia tab: chờ duyệt trước lỗi; xong chỉ hôm nay; bỏ việc huỷ, việc đóng trước hôm qua, ca vệ sinh cũ', () => {
    const entries = [
      fromAgentTask(agent({ id: 'a-run' })),
      fromAgentTask(agent({ id: 'a-wait', status: 'waiting_approval', createdAt: at('2026-11-19T09:00:00'), startedAt: null })),
      fromAgentTask(agent({ id: 'a-old-fail', status: 'failed', finishedAt: at('2026-11-16T09:00:00') })),
      fromAgentTask(agent({ id: 'a-cancel', status: 'cancelled', finishedAt: at('2026-11-19T10:00:00') })),
      fromAgentTask(agent({ id: 'a-done', status: 'done', finishedAt: at('2026-11-19T07:00:00') })),
      fromAgentTask(agent({ id: 'a-done-old', status: 'done', finishedAt: at('2026-11-18T20:00:00') })),
      hub({ id: 'w-sub', column: 'waiting', status: 'Submitted', statusLabel: 'Chờ duyệt', sortAt: at('2026-11-19T12:00:00') }),
      hub({ id: 'w-late', column: 'ended', status: 'Assigned', statusLabel: 'Quá hạn', overdue: true, sortAt: at('2026-11-10T08:00:00') }),
      hub({ id: 'w-q' }),
      hub({ kind: 'cleaning', id: '2026-11-19|Morning', code: 'VS-1911-S', column: 'waiting', status: 'review', date: '2026-11-19', block: 'Morning' }),
      hub({ kind: 'cleaning', id: '2026-11-15|Morning', code: 'VS-1511-S', column: 'waiting', status: 'review', date: '2026-11-15', block: 'Morning' }),
    ];
    const { lists, counts } = buildWorkCenter(entries, NOW);
    expect(lists.todo.map((e) => e.id)).toEqual(['w-sub', 'a-wait', '2026-11-19|Morning', 'w-late']);
    expect(lists.doing.map((e) => e.id)).toEqual(['a-run', 'w-q']);
    expect(lists.done.map((e) => e.id)).toEqual(['a-done']);
    expect(counts).toEqual({ todo: 4, doing: 2, done: 1 });
    expect(filterKind(lists.todo, 'cleaning').map((e) => e.code)).toEqual(['VS-1911-S']);
  });

  it('bấm mục mở đúng màn theo quyền', () => {
    const admin = user({ role: 'Admin', roles: ['Admin'] });
    const reviewer = user({ role: 'Manager', roles: ['Manager'], permissions: ['cleaning.review', 'cleaning.read'] });
    expect(workEntryRoute(fromAgentTask(agent({ id: 'x' })), admin)).toBe('/agent/tasks/x');
    expect(workEntryRoute(hub({ id: 'w9' }), admin)).toEqual({ pathname: '/manage/work-tasks', params: { id: 'w9' } });
    expect(workEntryRoute(hub({ id: 'w9' }), reviewer)).toBeNull();
    const vs = hub({ kind: 'cleaning', id: '2026-11-19|Evening', date: '2026-11-19', block: 'Evening' });
    expect(workEntryRoute(vs, reviewer)).toEqual({ pathname: '/manage/cleaning-review', params: { date: '2026-11-19', block: 'Evening' } });
    expect(vs.note).toBeNull();
  });

  it('dòng phụ: người · hạn (giờ nếu hôm nay)', () => {
    expect(entryMeta(hub({ dueAt: at('2026-11-19T18:00:00') }), NOW)).toBe('An Xing · hạn 18:00');
    expect(entryMeta(hub({ dueAt: at('2026-11-21T12:30:00') }), NOW)).toBe('An Xing · hạn 12:30 21/11');
  });
});
