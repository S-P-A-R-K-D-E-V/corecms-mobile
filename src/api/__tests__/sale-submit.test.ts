import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import axiosInstance, { setSessionExpiredHandler } from '../axios';
import { submitSale } from '../erp';

// POST /sales-orders không ném lỗi mà trả mã trạng thái: 4xx = máy chủ từ chối (chắc chắn chưa tạo hoá đơn),
// không có trả lời / 5xx = chưa biết kết quả (status null). 401 vẫn đi đường khôi phục phiên rồi gửi lại ĐÚNG gói cũ
// (cùng clientRequestId).

const mockSecure = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockSecure.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockSecure.delete(k);
  }),
}));

jest.mock('src/services/store-config', () => ({
  isMultiStore: true,
  getHostApi: () => 'https://shop1.store.devbyspark.com/api',
  getStoreCode: () => 'shop1',
}));

type Reply = { status: number; data?: unknown } | 'network' | 'timeout';
type Call = { path: string; auth: string | null; body: any; timeout: number | undefined };

let calls: Call[] = [];
let server: (call: Call) => Reply;

/** Adapter giả xử lý validateStatus như axios thật (settle). */
async function adapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = /^https?:/.test(config.url ?? '') ? config.url! : `${config.baseURL ?? ''}${config.url ?? ''}`;
  const call: Call = {
    path: url.replace(/^https?:\/\/[^/]+\/api/, ''),
    auth: ((config.headers as any)?.Authorization as string | undefined) ?? null,
    body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data ?? null,
    timeout: config.timeout,
  };
  calls.push(call);
  const reply = server(call);
  if (reply === 'network') throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
  if (reply === 'timeout') throw new AxiosError(`timeout of ${config.timeout}ms exceeded`, 'ECONNABORTED', config, {});
  const response: AxiosResponse = { data: reply.data ?? {}, status: reply.status, statusText: String(reply.status), headers: {}, config, request: {} };
  const accept = config.validateStatus ?? ((s: number) => s >= 200 && s < 300);
  if (accept(reply.status)) return response;
  throw new AxiosError(`HTTP ${reply.status}`, 'ERR_BAD_RESPONSE', config, {}, response);
}

const sale = {
  totalPayment: 35_000,
  method: 'Cash' as const,
  branchRefId: 'b1',
  clientRequestId: 'req-1',
  invoiceDetails: [{ productId: 'p1', productName: 'Kẹp tóc', quantity: 1, price: 35_000 }],
  payments: [{ method: 'Cash' as const, amount: 35_000 }],
};

const saleCalls = () => calls.filter((c) => c.path === '/sales-orders');

beforeEach(() => {
  mockSecure.clear();
  mockSecure.set('accessToken', 'tok');
  mockSecure.set('sessionToken', 's1');
  calls = [];
  setSessionExpiredHandler(jest.fn());
  axiosInstance.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
});

afterAll(() => setSessionExpiredHandler(null));

describe('submitSale', () => {
  it('2xx: trả mã trạng thái + body; gói gửi đi có chi nhánh, mã chống trùng và hết giờ đã cho', async () => {
    server = () => ({ status: 200, data: { id: 'inv-1', kiotVietSyncStatus: 'NotPushed' } });
    await expect(submitSale(sale, 15_000)).resolves.toEqual({ status: 200, data: { id: 'inv-1', kiotVietSyncStatus: 'NotPushed' } });
    expect(saleCalls()).toHaveLength(1);
    expect(saleCalls()[0]).toMatchObject({ auth: 'Bearer tok', timeout: 15_000, body: { branchRefId: 'b1', clientRequestId: 'req-1' } });
  });

  it('4xx: không ném lỗi — trả mã + body của máy chủ', async () => {
    const problem = { title: 'Giá bán không đúng giá niêm yết', status: 400 };
    server = () => ({ status: 400, data: problem });
    await expect(submitSale(sale, 15_000)).resolves.toEqual({ status: 400, data: problem });

    server = () => ({ status: 409, data: { title: 'Trùng' } });
    await expect(submitSale(sale, 15_000)).resolves.toMatchObject({ status: 409 });
  });

  it('5xx, mất mạng, hết giờ: status null (chưa biết kết quả), không ném lỗi', async () => {
    for (const reply of [{ status: 500, data: { title: 'Lỗi máy chủ' } }, { status: 504 }, 'network', 'timeout'] as Reply[]) {
      server = () => reply;
      await expect(submitSale(sale, 15_000)).resolves.toMatchObject({ status: null });
    }
  });

  it('401 giữa phiên: khôi phục phiên rồi gửi lại đúng gói cũ (cùng mã chống trùng)', async () => {
    server = (call) => {
      if (call.path === '/auth/restore-session') return { status: 200, data: { token: 'new', refreshToken: 'r2' } };
      return call.auth === 'Bearer new' ? { status: 200, data: { id: 'inv-1' } } : { status: 401, data: { title: 'Unauthorized' } };
    };
    await expect(submitSale(sale, 15_000)).resolves.toEqual({ status: 200, data: { id: 'inv-1' } });
    expect(saleCalls()).toHaveLength(2);
    expect(saleCalls()[1]!.body).toEqual(saleCalls()[0]!.body);
    expect(saleCalls()[1]!.timeout).toBe(15_000);
  });

  it('401 mà không khôi phục được phiên: chưa biết kết quả (máy chủ chưa xử lý gói này)', async () => {
    server = (call) => (call.path === '/auth/restore-session' ? 'network' : { status: 401, data: { title: 'Unauthorized' } });
    await expect(submitSale(sale, 15_000)).resolves.toMatchObject({ status: null });
  });
});
