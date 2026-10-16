import { toApiError, FORBIDDEN_MESSAGE } from '../axios';
import { extractApiError } from 'src/services/error';

// axiosInstance reject bằng body của response — giờ kèm `status` HTTP để màn hình phân biệt được 403 (và React Query
// không gọi lại lỗi 4xx), 403 body rỗng có thông báo tiếng Việt thay vì "Something went wrong".

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('src/services/store-config', () => ({
  isMultiStore: true,
  getHostApi: () => 'https://shop1.store.devbyspark.com/api',
  getStoreCode: () => 'shop1',
}));

const err = (status?: number, data?: unknown) => ({ response: status ? { status, data } : undefined });

describe('toApiError', () => {
  it('body JSON: giữ nguyên, thêm status HTTP nếu body chưa có', () => {
    expect(toApiError(err(403, { message: 'Chỉ Admin.' }))).toEqual({ message: 'Chỉ Admin.', status: 403 });
    expect(toApiError(err(400, { title: 'Sai', status: 400 }))).toEqual({ title: 'Sai', status: 400 });
  });

  it('403 body rỗng → lỗi forbidden đọc được', () => {
    const e = toApiError(err(403, ''));

    expect(e).toMatchObject({ status: 403, error: 'forbidden' });
    expect(extractApiError(e)).toBe(FORBIDDEN_MESSAGE);
  });

  it('body chuỗi giữ nguyên; mất mạng / 5xx body rỗng giữ chuỗi cũ', () => {
    expect(toApiError(err(400, 'Invalid status'))).toBe('Invalid status');
    expect(toApiError(err())).toBe('Something went wrong');
    expect(toApiError(err(500, ''))).toBe('Something went wrong');
  });
});
