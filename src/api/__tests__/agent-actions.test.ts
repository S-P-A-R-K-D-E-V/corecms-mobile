// Phiếu agent xin làm (K3): đúng đường dẫn / tham số của core-be AgentActionsController, ghi chú rỗng không gửi.

jest.mock('../axios', () => {
  const actual = jest.requireActual('../axios');
  return { __esModule: true, default: { get: jest.fn(), post: jest.fn() }, endpoints: actual.endpoints };
});
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import axios from '../axios';
import {
  approveAgentAction,
  decisionBody,
  getAgentAction,
  getAgentActionPendingCount,
  getAgentActions,
  rejectAgentAction,
} from '../agent-actions';

const get = axios.get as jest.Mock;
const post = axios.post as jest.Mock;
const ID = '3f2b8c1e-1d2a-4c5b-9e8f-0a1b2c3d4e5f';

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

describe('agent-actions API', () => {
  it('danh sách: status + take, BE trả không phải mảng → []', async () => {
    get.mockResolvedValueOnce({ data: [{ id: ID }] });
    expect(await getAgentActions()).toEqual([{ id: ID }]);
    expect(get).toHaveBeenCalledWith('/agent-actions', { params: { status: 'pending', take: 50 } });

    get.mockResolvedValueOnce({ data: null });
    expect(await getAgentActions('all', 20)).toEqual([]);
    expect(get).toHaveBeenLastCalledWith('/agent-actions', { params: { status: 'all', take: 20 } });
  });

  it('số phiếu chờ: lấy count, thiếu / sai → 0', async () => {
    get.mockResolvedValueOnce({ data: { count: 3 } });
    expect(await getAgentActionPendingCount()).toBe(3);
    expect(get).toHaveBeenCalledWith('/agent-actions/pending-count');
    get.mockResolvedValueOnce({ data: {} });
    expect(await getAgentActionPendingCount()).toBe(0);
    get.mockResolvedValueOnce({ data: { count: 'x' } });
    expect(await getAgentActionPendingCount()).toBe(0);
  });

  it('chi tiết theo id', async () => {
    get.mockResolvedValueOnce({ data: { id: ID, status: 'pending' } });
    expect(await getAgentAction(ID)).toEqual({ id: ID, status: 'pending' });
    expect(get).toHaveBeenCalledWith(`/agent-actions/${ID}`);
  });

  it('duyệt / từ chối: POST kèm ghi chú đã cắt khoảng trắng; ghi chú rỗng gửi {}', async () => {
    post.mockResolvedValue({ data: { id: ID, status: 'executed' } });
    expect(await approveAgentAction(ID, '  ok  ')).toEqual({ id: ID, status: 'executed' });
    expect(post).toHaveBeenLastCalledWith(`/agent-actions/${ID}/approve`, { note: 'ok' });

    await rejectAgentAction(ID, '   ');
    expect(post).toHaveBeenLastCalledWith(`/agent-actions/${ID}/reject`, {});
  });

  it('decisionBody', () => {
    expect(decisionBody(undefined)).toEqual({});
    expect(decisionBody(null)).toEqual({});
    expect(decisionBody(' sai giá ')).toEqual({ note: 'sai giá' });
  });
});
