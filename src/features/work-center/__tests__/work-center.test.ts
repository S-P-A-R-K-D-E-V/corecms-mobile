import dayjs from 'dayjs';

import type { AgentTaskView } from 'src/api/agent-center';
import { normalizeWorkHubItem } from 'src/api/work-hub';

import {
  agentColumn,
  buildWorkCenter,
  canSeeWorkCenter,
  availableTabs,
  entryMeta,
  filterSource,
  fromAgentTask,
  fromHubItem,
  hubKinds,
  legacyWorkRedirect,
  resolveSource,
  resolveTab,
  sourceFilters,
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
  it('người có quyền agent / việc giao / cleaning.* thấy; mỗi nguồn, mỗi tab theo quyền riêng', () => {
    expect(canSeeWorkCenter(user({ role: 'Admin', roles: ['Admin'] }))).toBe(true);
    expect(canSeeWorkCenter(user({ role: 'Manager', roles: ['Manager'], permissions: ['hr.task.manage'] }))).toBe(true);
    // cleaning.read chỉ cấp cho quản lý (PermissionCatalog) — đủ để xem bảng + lịch tuần.
    expect(canSeeWorkCenter(user({ role: 'Manager', roles: ['Manager'], permissions: ['cleaning.read'] }))).toBe(true);
    expect(canSeeWorkCenter(user({ role: 'Staff', roles: ['Staff'], permissions: ['inspection.conduct'] }))).toBe(false);

    const reader = workSources(user({ role: 'Manager', roles: ['Manager'], permissions: ['cleaning.read'], enabledFeatures: ['workforce.cleaning'] }));
    expect(reader).toEqual({ agent: false, work: false, cleaning: true, inspection: false, schedule: true, editSchedule: false });
    expect(availableTabs(reader)).toEqual(['board', 'schedule']);
    expect(hubKinds(reader)).toEqual(['cleaning']);

    // Không có gói vệ sinh / việc theo ca: không gọi API cleaning/series (core-be RequireFeature).
    const noPlan = workSources(user({ role: 'Admin', roles: ['Admin'], enabledFeatures: [] }));
    expect(noPlan.schedule).toBe(false);
    expect(noPlan.editSchedule).toBe(false);
    expect(availableTabs(noPlan)).toEqual(['board', 'assign']);

    const admin = workSources(user({ role: 'Admin', roles: ['Admin'], enabledFeatures: ['workforce.cleaning'] }));
    expect(availableTabs(admin)).toEqual(['board', 'schedule', 'assign']);
    expect(hubKinds(admin)).toEqual(['work', 'cleaning', 'fault', 'corrective']);
    expect(sourceFilters(admin).map((f) => f.key)).toEqual(['all', 'agent', 'schedule', 'assigned', 'inspection']);
    expect(sourceFilters(reader).map((f) => f.key)).toEqual(['all', 'schedule']);
  });

  it('tab / nguồn từ tham số: lạ hoặc không đủ quyền → mặc định', () => {
    const reader = workSources(user({ role: 'Manager', roles: ['Manager'], permissions: ['cleaning.read'], enabledFeatures: ['workforce.cleaning'] }));
    expect(resolveTab('schedule', reader)).toBe('schedule');
    expect(resolveTab('assign', reader)).toBe('board');
    expect(resolveTab(undefined, reader)).toBe('board');
    expect(resolveSource('inspection')).toBe('inspection');
    expect(resolveSource('xyz')).toBe('all');
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
    expect(filterSource(lists.todo, 'schedule').map((e) => e.code)).toEqual(['VS-1911-S']);
  });

  it('bấm mục mở đúng màn theo quyền', () => {
    const admin = user({ role: 'Admin', roles: ['Admin'] });
    const reviewer = user({ role: 'Manager', roles: ['Manager'], permissions: ['cleaning.review', 'cleaning.read'] });
    expect(workEntryRoute(fromAgentTask(agent({ id: 'x' })), admin)).toBe('/agent/tasks/x');
    expect(workEntryRoute(hub({ id: 'w9' }), admin)).toEqual({ pathname: '/manage/work-center/task-review', params: { id: 'w9' } });
    expect(workEntryRoute(hub({ id: 'w9' }), reviewer)).toBeNull();
    const vs = hub({ kind: 'cleaning', id: '2026-11-19|Evening', date: '2026-11-19', block: 'Evening' });
    expect(workEntryRoute(vs, reviewer)).toEqual({
      pathname: '/manage/work-center/shift-review',
      params: { date: '2026-11-19', block: 'Evening' },
    });
    expect(vs.note).toBeNull();
    expect(workEntryRoute(hub({ kind: 'fault', id: 'f1' }), admin)).toBe('/inspection/faults');
    expect(workEntryRoute(hub({ kind: 'fault', id: 'f1' }), reviewer)).toBeNull();
    expect(workEntryRoute(hub({ kind: 'corrective', id: 'c1' }), admin)).toBeNull();
  });

  it('nguồn: việc lặp của người cố định = Lịch tuần; core-be cũ không trả source thì suy theo loại', () => {
    expect(hub({ source: 'schedule' }).source).toBe('schedule');
    expect(hub({}).source).toBe('assigned');
    expect(hub({ kind: 'cleaning', id: '2026-11-19|Morning' }).source).toBe('schedule');
    expect(hub({ kind: 'fault', id: 'f' }).source).toBe('inspection');
    expect(fromAgentTask(agent({})).source).toBe('agent');
  });

  it('lỗi phải sửa / sửa tận gốc: quá hạn ở Cần xử lý, gợi ý ở Đang làm, đã bỏ không hiện', () => {
    const entries = [
      hub({ kind: 'fault', id: 'f-late', code: 'LO-1', column: 'ended', status: 'overdue', statusLabel: 'Quá hạn sửa', overdue: true, sortAt: at('2026-11-10T08:00:00') }),
      hub({ kind: 'fault', id: 'f-open', code: 'LO-2', column: 'queued', status: 'open', statusLabel: 'Chờ sửa' }),
      hub({ kind: 'corrective', id: 'c-sug', code: 'STG-1', column: 'queued', status: 'suggested', statusLabel: 'Gợi ý' }),
      hub({ kind: 'corrective', id: 'c-bo', code: 'STG-2', column: 'ended', status: 'dismissed', statusLabel: 'Đã bỏ', sortAt: at('2026-11-19T10:00:00') }),
      hub({ kind: 'fault', id: 'f-fixed', code: 'LO-3', column: 'done', status: 'fixed', statusLabel: 'Đã sửa', sortAt: at('2026-11-19T11:00:00') }),
    ];
    const { lists } = buildWorkCenter(entries, NOW);
    expect(lists.todo.map((e) => e.id)).toEqual(['f-late']);
    expect(lists.doing.map((e) => e.id).sort()).toEqual(['c-sug', 'f-open']);
    expect(lists.done.map((e) => e.id)).toEqual(['f-fixed']);
    expect(lists.todo[0].tone).toBe('error');
  });

  it('màn cũ chuyển hướng về Công việc, giữ ngày + ca / id việc', () => {
    expect(legacyWorkRedirect('cleaning')).toEqual({ pathname: '/manage/work-center', params: { tab: 'board', source: 'schedule' } });
    expect(legacyWorkRedirect('cleaning-builder')).toEqual({ pathname: '/manage/work-center', params: { tab: 'schedule' } });
    expect(legacyWorkRedirect('cleaning-tasks')).toEqual({ pathname: '/manage/work-center', params: { tab: 'schedule' } });
    expect(legacyWorkRedirect('work-day', { date: '2026-11-19' })).toEqual({ pathname: '/manage/work-center', params: { tab: 'board' } });
    expect(legacyWorkRedirect('cleaning-review', { date: '2026-11-19', block: 'Evening' })).toEqual({
      pathname: '/manage/work-center/shift-review',
      params: { date: '2026-11-19', block: 'Evening' },
    });
    expect(legacyWorkRedirect('cleaning-review', {})).toEqual({ pathname: '/manage/work-center/shift-review', params: {} });
    expect(legacyWorkRedirect('work-tasks', { id: 'w9' })).toEqual({ pathname: '/manage/work-center/task-review', params: { id: 'w9' } });
    expect(legacyWorkRedirect('work-tasks', { id: ['w9'] })).toEqual({ pathname: '/manage/work-center/task-review', params: { id: 'w9' } });
    expect(legacyWorkRedirect('work-tasks', {})).toEqual({ pathname: '/manage/work-center', params: { tab: 'assign' } });
  });

  it('dòng phụ: người · hạn (giờ nếu hôm nay)', () => {
    expect(entryMeta(hub({ dueAt: at('2026-11-19T18:00:00') }), NOW)).toBe('An Xing · hạn 18:00');
    expect(entryMeta(hub({ dueAt: at('2026-11-21T12:30:00') }), NOW)).toBe('An Xing · hạn 12:30 21/11');
  });
});
