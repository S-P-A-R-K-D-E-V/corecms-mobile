jest.mock('../axios', () => {
  const actual = jest.requireActual('../axios');
  return { __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, endpoints: actual.endpoints };
});
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import axios from '../axios';
import { completeCleaningTask, createCleaningSeries, getCleaningSeries, stopCleaningSeries, updateCleaningSeries } from '../cleaning';
import { reassignWorkTask } from '../hr';

// API Công việc: chuỗi việc định kỳ, hoàn thành việc không cần ảnh, đổi người.

const mockGet = axios.get as jest.Mock;
const mockPost = axios.post as jest.Mock;
const mockPut = axios.put as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('API việc định kỳ / đổi người', () => {
  it('đúng đường dẫn + body', async () => {
    mockGet.mockResolvedValue({ data: [{ seriesId: 's1' }] });
    mockPost.mockResolvedValue({ data: { seriesId: 's1' } });
    mockPut.mockResolvedValue({ data: { id: 't1' } });

    expect(await getCleaningSeries('2026-11-24')).toEqual([{ seriesId: 's1' }]);
    expect(mockGet).toHaveBeenCalledWith('/cleaning/series', { params: { date: '2026-11-24' } });

    const body = { name: 'Lau kính', requiresPhoto: true, autoViolation: false, fromDate: '2026-11-24', cells: [{ dayOfWeek: 1, block: 'Morning' as const }] };
    await createCleaningSeries(body);
    expect(mockPost).toHaveBeenCalledWith('/cleaning/series', body);

    await updateCleaningSeries('s1', { ...body, effectiveFrom: '2026-11-25' } as any);
    expect(mockPut).toHaveBeenCalledWith('/cleaning/series/s1', expect.objectContaining({ effectiveFrom: '2026-11-25' }));

    await stopCleaningSeries('s1', '2026-11-30');
    expect(mockPost).toHaveBeenLastCalledWith('/cleaning/series/s1/stop', { fromDate: '2026-11-30' });

    await reassignWorkTask('t1', 'u2');
    expect(mockPut).toHaveBeenLastCalledWith('/work-tasks/t1/reassign', { assigneeId: 'u2' });
  });

  it('getCleaningSeries: response lạ → mảng rỗng', async () => {
    mockGet.mockResolvedValue({ data: null });
    expect(await getCleaningSeries('2026-11-24')).toEqual([]);
  });

  it('việc không cần ảnh: không xin presigned URL, gửi danh sách ảnh rỗng', async () => {
    mockPost.mockResolvedValue({ data: { id: 'i1', status: 'Done' } });
    await completeCleaningTask('i1', []);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith('/cleaning/tasks/i1/complete', { objectKeys: [] });
  });
});
