import {
  SEGMENT_STATUSES,
  agentTaskRoute,
  canCancelTask,
  canNoteTask,
  canRetryTask,
  canStopTask,
  detailRefreshMs,
  elapsedMs,
  formatDuration,
  formatStepDuration,
  formatTokens,
  listRefreshMs,
  planProgress,
  runningCardCounts,
  taskSegment,
  taskStatusInfo,
  totalTokens,
} from '../agent-task-format';

// Việc của agent (K4): nhóm theo tab, tiến độ, thời gian, token, nhịp làm mới, thao tác được phép.

describe('trạng thái → tab', () => {
  it('Đang làm / Xong / Lỗi – Dừng; trạng thái lạ → Đang làm', () => {
    for (const s of ['queued', 'running', 'waiting_approval', 'waiting_human']) expect(taskSegment(s)).toBe('active');
    expect(taskSegment('done')).toBe('done');
    for (const s of ['failed', 'stopped', 'cancelled']) expect(taskSegment(s)).toBe('ended');
    expect(taskSegment('paused_new')).toBe('active');
  });

  it('mọi trạng thái của hợp đồng thuộc đúng một tab và có nhãn', () => {
    const all = [...SEGMENT_STATUSES.active, ...SEGMENT_STATUSES.done, ...SEGMENT_STATUSES.ended];
    expect(new Set(all).size).toBe(8);
    for (const s of all) expect(taskStatusInfo(s).label).not.toBe(s);
    expect(taskStatusInfo('waiting_human').label).toBe('Chờ người');
    expect(taskStatusInfo('lạ').label).toBe('lạ');
  });
});

describe('tiến độ / thời gian / token', () => {
  it('planProgress: xong + bỏ qua tính là đã qua; không có kế hoạch → null', () => {
    expect(
      planProgress([{ status: 'done' }, { status: 'skipped' }, { status: 'in_progress' }, { status: 'pending' }])
    ).toEqual({ done: 2, total: 4 });
    expect(planProgress([])).toBeNull();
    expect(planProgress(null)).toBeNull();
  });

  it('elapsedMs: bắt đầu → kết thúc; chưa kết thúc → tới now; chưa bắt đầu → null', () => {
    const start = '2026-11-18T03:00:00Z';
    const now = new Date('2026-11-18T03:02:05Z').getTime();
    expect(elapsedMs({ startedAt: start, finishedAt: '2026-11-18T03:00:45Z' }, now)).toBe(45_000);
    expect(elapsedMs({ startedAt: start, finishedAt: null }, now)).toBe(125_000);
    expect(elapsedMs({ startedAt: null, finishedAt: null }, now)).toBeNull();
  });

  it('formatDuration', () => {
    expect(formatDuration(45_000)).toBe('45 giây');
    expect(formatDuration(125_000)).toBe('2 phút 5 giây');
    expect(formatDuration(120_000)).toBe('2 phút');
    expect(formatDuration((2 * 60 + 10) * 60_000)).toBe('2 giờ 10 phút');
    expect(formatDuration(27 * 3_600_000)).toBe('1 ngày 3 giờ');
    expect(formatDuration(null)).toBe('');
  });

  it('formatStepDuration', () => {
    expect(formatStepDuration(850)).toBe('850 ms');
    expect(formatStepDuration(1_240)).toBe('1,2 giây');
    expect(formatStepDuration(0)).toBe('');
  });

  it('formatTokens + totalTokens', () => {
    expect(formatTokens(850)).toBe('850');
    expect(formatTokens(12_345)).toBe('12,3K');
    expect(formatTokens(1_500_000)).toBe('1,5M');
    expect(formatTokens(0)).toBe('0');
    expect(totalTokens({ inputTokens: 1200, outputTokens: 300 })).toBe(1500);
  });
});

describe('nhịp làm mới', () => {
  it('danh sách: có việc đang chạy / chờ chạy → 5 giây, không → 30 giây, màn khuất → dừng', () => {
    expect(listRefreshMs([{ status: 'done' }, { status: 'running' }], true)).toBe(5_000);
    expect(listRefreshMs([{ status: 'queued' }], true)).toBe(5_000);
    expect(listRefreshMs([{ status: 'waiting_human' }], true)).toBe(30_000);
    expect(listRefreshMs(undefined, true)).toBe(30_000);
    expect(listRefreshMs([{ status: 'running' }], false)).toBe(false);
  });

  it('chi tiết: đang chạy 3 giây, chờ người 15 giây, đã xong / màn khuất → dừng', () => {
    expect(detailRefreshMs('running', true)).toBe(3_000);
    expect(detailRefreshMs('queued', true)).toBe(3_000);
    expect(detailRefreshMs('waiting_approval', true)).toBe(15_000);
    expect(detailRefreshMs('done', true)).toBe(false);
    expect(detailRefreshMs('running', false)).toBe(false);
    expect(detailRefreshMs(undefined, true)).toBe(false);
  });
});

describe('thao tác được phép', () => {
  it('Dừng: đang chạy / chờ chạy / chờ *; Chạy lại: lỗi / đã dừng; Huỷ: chờ chạy; Nhắn: trừ xong / đã huỷ', () => {
    expect(['running', 'queued', 'waiting_approval', 'waiting_human'].every(canStopTask)).toBe(true);
    expect(['done', 'failed', 'stopped', 'cancelled'].some(canStopTask)).toBe(false);
    expect(canRetryTask('failed') && canRetryTask('stopped')).toBe(true);
    expect(canRetryTask('done') || canRetryTask('running')).toBe(false);
    expect(canCancelTask('queued')).toBe(true);
    expect(canCancelTask('running')).toBe(false);
    expect(canNoteTask('waiting_human') && canNoteTask('failed')).toBe(true);
    expect(canNoteTask('done') || canNoteTask('cancelled')).toBe(false);
  });
});

describe('thẻ trang chủ', () => {
  const summary = (running: number, waiting_human: number) => ({
    paused: false,
    runnerEnabled: true,
    agents: 1,
    counts: { queued: 0, running, waiting_approval: 0, waiting_human, done_today: 0, failed_today: 0 },
  });

  it('ẩn khi cả hai bằng 0 hoặc lỗi (null)', () => {
    expect(runningCardCounts(summary(0, 0))).toBeNull();
    expect(runningCardCounts(null)).toBeNull();
    expect(runningCardCounts(summary(2, 0))).toEqual({ running: 2, waitingHuman: 0 });
    expect(runningCardCounts(summary(0, 1))).toEqual({ running: 0, waitingHuman: 1 });
  });

  it('đường dẫn chi tiết', () => {
    expect(agentTaskRoute('abc')).toBe('/agent/tasks/abc');
  });
});
