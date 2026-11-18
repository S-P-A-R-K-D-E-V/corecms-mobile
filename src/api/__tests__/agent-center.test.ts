// Trung tâm Agent (K4): đúng đường dẫn / tham số của core-be AgentCenterController, dữ liệu thiếu được chuẩn hoá.

jest.mock('../axios', () => {
  const actual = jest.requireActual('../axios');
  return { __esModule: true, default: { get: jest.fn(), post: jest.fn() }, endpoints: actual.endpoints };
});
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import axios from '../axios';
import {
  addAgentTaskNote,
  cancelAgentTask,
  getAgentCenterSummary,
  getAgentTask,
  getAgentTasks,
  normalizeTask,
  noteBody,
  retryAgentTask,
  stopAgentTask,
} from '../agent-center';

const get = axios.get as jest.Mock;
const post = axios.post as jest.Mock;
const ID = '3f2b8c1e-1d2a-4c5b-9e8f-0a1b2c3d4e5f';

const TASK = {
  id: ID,
  agentId: 'a1',
  agentName: 'Agent kho',
  title: 'Kiểm tồn',
  instruction: 'Kiểm tồn kho chi nhánh 1',
  source: 'manual',
  sourceRef: null,
  parentTaskId: null,
  status: 'running',
  plan: [{ title: 'Tra tồn', status: 'done', note: null }],
  currentStepIndex: 1,
  currentStepLabel: 'Bước 2/3 — đang tra tồn kho',
  result: null,
  error: null,
  pendingActionId: null,
  createdByUserId: 'u1',
  createdByName: 'Lan',
  createdAt: '2026-11-18T03:00:00Z',
  startedAt: '2026-11-18T03:00:05Z',
  finishedAt: null,
  stopRequested: false,
  inputTokens: 1200,
  outputTokens: 300,
  toolCalls: 2,
};

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('agent-center API', () => {
  it('tóm tắt: đọc counts snake_case; thiếu / sai → 0', async () => {
    get.mockResolvedValueOnce({
      data: { paused: false, runnerEnabled: true, counts: { queued: 1, running: 2, waiting_approval: 0, waiting_human: 3, done_today: 4, failed_today: 'x' }, agents: 2 },
    });
    const s = await getAgentCenterSummary();
    expect(get).toHaveBeenCalledWith('/agent-center/summary');
    expect(s.counts).toEqual({ queued: 1, running: 2, waiting_approval: 0, waiting_human: 3, done_today: 4, failed_today: 0 });
    expect(s.agents).toBe(2);

    get.mockResolvedValueOnce({ data: {} });
    const empty = await getAgentCenterSummary();
    expect(empty.counts.running).toBe(0);
    expect(empty.paused).toBe(false);
  });

  it('danh sách: nối trạng thái bằng dấu phẩy + take; không trạng thái thì không gửi status; BE trả không phải mảng → []', async () => {
    get.mockResolvedValueOnce({ data: [TASK] });
    const list = await getAgentTasks(['running', 'queued']);
    expect(get).toHaveBeenCalledWith('/agent-center/tasks', { params: { status: 'running,queued', take: 100 } });
    expect(list[0].title).toBe('Kiểm tồn');
    expect(list[0].plan).toHaveLength(1);

    get.mockResolvedValueOnce({ data: null });
    expect(await getAgentTasks([], 20)).toEqual([]);
    expect(get).toHaveBeenLastCalledWith('/agent-center/tasks', { params: { take: 20 } });
  });

  it('chi tiết: { task, steps } — bước xếp theo seq, thiếu steps → []', async () => {
    get.mockResolvedValueOnce({
      data: {
        task: TASK,
        steps: [
          { id: 's2', taskId: ID, seq: 2, kind: 'tool', name: 'inventory_search', summary: 'Tra tồn', detail: '{}', status: 'ok', durationMs: 900, inputTokens: 0, outputTokens: 0, createdAt: '2026-11-18T03:00:07Z', authorName: null },
          { id: 's1', taskId: ID, seq: 1, kind: 'plan', name: null, summary: 'Lập kế hoạch', detail: null, status: 'ok', durationMs: 0, inputTokens: 0, outputTokens: 0, createdAt: '2026-11-18T03:00:06Z', authorName: null },
        ],
      },
    });
    const d = await getAgentTask(ID);
    expect(get).toHaveBeenCalledWith(`/agent-center/tasks/${ID}`);
    expect(d.task.id).toBe(ID);
    expect(d.steps.map((s) => s.id)).toEqual(['s1', 's2']);

    get.mockResolvedValueOnce({ data: { task: TASK } });
    expect((await getAgentTask(ID)).steps).toEqual([]);
  });

  it('nhắn chỉ dẫn: POST { text } đã cắt khoảng trắng, trả bước note', async () => {
    post.mockResolvedValueOnce({ data: { id: 'n1', taskId: ID, seq: 5, kind: 'note', summary: 'Chỉ kiểm CN1', status: 'ok', authorName: 'Lan' } });
    const step = await addAgentTaskNote(ID, '  Chỉ kiểm CN1  ');
    expect(post).toHaveBeenCalledWith(`/agent-center/tasks/${ID}/notes`, { text: 'Chỉ kiểm CN1' });
    expect(step.kind).toBe('note');
    expect(step.authorName).toBe('Lan');
    expect(noteBody(' a ')).toEqual({ text: 'a' });
  });

  it('dừng / chạy lại / huỷ: POST đúng đường dẫn, trả việc đã cập nhật', async () => {
    post.mockResolvedValue({ data: { ...TASK, stopRequested: true } });
    expect((await stopAgentTask(ID)).stopRequested).toBe(true);
    expect(post).toHaveBeenLastCalledWith(`/agent-center/tasks/${ID}/stop`);
    await retryAgentTask(ID);
    expect(post).toHaveBeenLastCalledWith(`/agent-center/tasks/${ID}/retry`);
    await cancelAgentTask(ID);
    expect(post).toHaveBeenLastCalledWith(`/agent-center/tasks/${ID}/cancel`);
  });

  it('normalizeTask: plan thiếu → [], token thiếu → 0, chuỗi rỗng → null', () => {
    const t = normalizeTask({ id: ID, status: 'queued', plan: null, result: '', createdAt: '2026-11-18T03:00:00Z' });
    expect(t.plan).toEqual([]);
    expect(t.inputTokens).toBe(0);
    expect(t.outputTokens).toBe(0);
    expect(t.result).toBeNull();
    expect(t.stopRequested).toBe(false);
  });
});
