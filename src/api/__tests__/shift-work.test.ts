import {
  completeShiftWork,
  getMyCorrectiveActions,
  getMyShiftWork,
  markCorrectiveActionDone,
  uploadShiftWorkPhoto,
} from '../inspection';
import axios from '../axios';

// Công việc trong ca + sửa tận gốc: đúng đường dẫn và thân request theo core-be ShiftWorkController / CorrectiveActions.

jest.mock('../axios', () => {
  const actual = jest.requireActual('../axios');
  return { __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, endpoints: actual.endpoints };
});

const mockPutFile = jest.fn(async () => {});
jest.mock('src/services/upload/presigned-put', () => ({
  putFileToPresignedUrl: (...args: unknown[]) => (mockPutFile as any)(...args),
}));

const mockAxios = axios as unknown as { get: jest.Mock; post: jest.Mock; put: jest.Mock };

afterEach(() => jest.clearAllMocks());

describe('shift-work', () => {
  it('lấy việc trong ca theo ngày', async () => {
    mockAxios.get.mockResolvedValue({ data: [] });
    await getMyShiftWork('2026-10-29');
    expect(mockAxios.get).toHaveBeenCalledWith('/shift-work/mine', { params: { date: '2026-10-29' } });
  });

  it('ảnh: xin URL theo ca + ngày rồi PUT tệp, trả object key', async () => {
    mockAxios.post.mockResolvedValue({ data: [{ objectKey: 'shift-work/s1/k.jpg', uploadUrl: 'https://r2/put' }] });
    const key = await uploadShiftWorkPhoto('s1', '2026-10-29', { uri: 'file:///a.jpg', type: 'image/jpeg' });
    expect(mockAxios.post).toHaveBeenCalledWith('/shift-work/photos/presign', {
      shiftScheduleId: 's1',
      date: '2026-10-29',
      files: [{ contentType: 'image/jpeg' }],
    });
    expect(mockPutFile).toHaveBeenCalledWith('https://r2/put', 'file:///a.jpg', 'image/jpeg');
    expect(key).toBe('shift-work/s1/k.jpg');
  });

  it('"Đã làm" gửi ngày, ca, hạng mục, ghi chú và key ảnh', async () => {
    mockAxios.post.mockResolvedValue({ data: { itemId: 'i1' } });
    const body = { date: '2026-10-29', shiftScheduleId: 's1', itemId: 'i1', note: null, photoKeys: ['k1'] };
    await completeShiftWork(body);
    expect(mockAxios.post).toHaveBeenCalledWith('/shift-work/complete', body);
  });
});

describe('sửa tận gốc của tôi', () => {
  it('lấy danh sách và đánh dấu xong', async () => {
    mockAxios.get.mockResolvedValue({ data: [] });
    mockAxios.put.mockResolvedValue({ data: { id: 'a1', status: 'Done' } });
    await getMyCorrectiveActions();
    await markCorrectiveActionDone('a1', 'Đã thêm kệ');
    expect(mockAxios.get).toHaveBeenCalledWith('/corrective-actions/mine');
    expect(mockAxios.put).toHaveBeenCalledWith('/corrective-actions/a1/done', { note: 'Đã thêm kệ' });
  });
});
