import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import axiosInstance, { isAnonymousAuthPath, setSessionExpiredHandler } from '../axios';
import { isAuthRejection, restoreSession } from '../session';

// Giữ phiên trên máy: 401 giữa phiên → khôi phục bằng sessionToken MỘT lần cho mọi request đang chờ, gửi
// lại mỗi request một lần. Chỉ xoá token khi server từ chối dứt khoát (4xx); mất mạng / 5xx giữ nguyên.
// Không bao giờ đụng tới cửa hàng đã nhớ (storeProfile).

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

let mockHost = 'https://shop1.store.devbyspark.com/api';
jest.mock('src/services/store-config', () => ({ getHostApi: () => mockHost }));

// ----------------------------------------------------------------------
// Server giả: adapter dùng chung cho axiosInstance và axios trần (restore-session).

type Reply = { status: number; data?: unknown } | 'network';
type Call = { path: string; auth: string | null; body: any };

let calls: Call[] = [];
let server: (call: Call) => Reply | Promise<Reply>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function adapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = /^https?:/.test(config.url ?? '') ? config.url! : `${config.baseURL ?? ''}${config.url ?? ''}`;
  const call: Call = {
    path: url.replace(/^https?:\/\/[^/]+\/api/, ''),
    auth: ((config.headers as any)?.Authorization as string | undefined) ?? null,
    body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data ?? null,
  };
  calls.push(call);
  const reply = await server(call);
  if (reply === 'network') throw new AxiosError('Network Error', 'ERR_NETWORK', config, {});
  const response: AxiosResponse = {
    data: reply.data ?? {},
    status: reply.status,
    statusText: String(reply.status),
    headers: {},
    config,
    request: {},
  };
  if (reply.status >= 200 && reply.status < 300) return response;
  throw new AxiosError(`HTTP ${reply.status}`, 'ERR_BAD_RESPONSE', config, {}, response);
}

const restoreCalls = () => calls.filter((c) => c.path === '/auth/restore-session');

/** Endpoint cần đăng nhập: chỉ nhận token `valid`. */
const guarded = (valid: string) => (call: Call): Reply =>
  call.auth === `Bearer ${valid}` ? { status: 200, data: { ok: call.path } } : { status: 401, data: { title: 'Unauthorized' } };

const onExpired = jest.fn();

beforeEach(() => {
  mockSecure.clear();
  mockSecure.set('accessToken', 'old');
  mockSecure.set('refreshToken', 'r1');
  mockSecure.set('sessionToken', 's1');
  mockSecure.set('storeProfile', '{"code":"shop1","host":"shop1.store.devbyspark.com"}');
  mockHost = 'https://shop1.store.devbyspark.com/api';
  calls = [];
  onExpired.mockReset();
  setSessionExpiredHandler(onExpired);
  axiosInstance.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
});

afterAll(() => setSessionExpiredHandler(null));

describe('401 giữa phiên', () => {
  it('nhiều request cùng 401 → khôi phục đúng MỘT lần, gửi lại cả hai bằng token mới', async () => {
    server = async (call) => {
      if (call.path === '/auth/restore-session') {
        await sleep(20); // để request thứ hai cũng 401 trong lúc đang khôi phục
        return { status: 200, data: { token: 'new', refreshToken: 'r2', id: 'u1' } };
      }
      return guarded('new')(call);
    };

    const [a, b] = await Promise.all([axiosInstance.get('/users/me'), axiosInstance.get('/branches')]);

    expect(a.data).toEqual({ ok: '/users/me' });
    expect(b.data).toEqual({ ok: '/branches' });
    expect(restoreCalls()).toHaveLength(1);
    expect(restoreCalls()[0]).toMatchObject({ auth: null, body: { sessionToken: 's1' } });
    expect(mockSecure.get('accessToken')).toBe('new');
    expect(mockSecure.get('refreshToken')).toBe('r2');
    expect(mockSecure.get('sessionToken')).toBe('s1');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('chỉ gửi lại một lần: vẫn 401 sau khi khôi phục thì trả lỗi, không lặp', async () => {
    server = (call) =>
      call.path === '/auth/restore-session'
        ? { status: 200, data: { token: 'new', refreshToken: 'r2' } }
        : { status: 401, data: { title: 'Unauthorized' } };

    await expect(axiosInstance.get('/users/me')).rejects.toEqual({ title: 'Unauthorized' });
    expect(restoreCalls()).toHaveLength(1);
    expect(calls.filter((c) => c.path === '/users/me')).toHaveLength(2);
  });

  it('server từ chối phiên (4xx) → xoá token, báo AuthProvider đăng xuất, KHÔNG đụng cửa hàng đã nhớ', async () => {
    server = (call) =>
      call.path === '/auth/restore-session' ? { status: 401, data: { errors: { 'User.InvalidSession': ['x'] } } } : guarded('new')(call);

    await expect(axiosInstance.get('/users/me')).rejects.toEqual({ title: 'Unauthorized' });
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.has('refreshToken')).toBe(false);
    expect(mockSecure.has('sessionToken')).toBe(false);
    expect(mockSecure.get('storeProfile')).toContain('shop1');
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['mất mạng', 'network' as const],
    ['server lỗi 503', { status: 503 }],
    ['quá tải 429', { status: 429 }],
  ])('%s lúc khôi phục → giữ nguyên mọi token, không đăng xuất', async (_label, restoreReply) => {
    server = (call) => (call.path === '/auth/restore-session' ? restoreReply : guarded('new')(call));

    await expect(axiosInstance.get('/users/me')).rejects.toEqual({ title: 'Unauthorized' });
    expect(mockSecure.get('accessToken')).toBe('old');
    expect(mockSecure.get('refreshToken')).toBe('r1');
    expect(mockSecure.get('sessionToken')).toBe('s1');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it.each([
    '/auth/login',
    '/auth/restore-session',
    '/auth/oauth-login',
    'https://shop2.store.devbyspark.com/api/auth/sso/exchange',
  ])('401 từ %s (gọi khi chưa đăng nhập) → không khôi phục phiên', async (url) => {
    server = () => ({ status: 401, data: { title: 'Bad credentials' } });

    await expect(axiosInstance.post(url, {})).rejects.toEqual({ title: 'Bad credentials' });
    expect(calls).toHaveLength(1);
    expect(mockSecure.get('sessionToken')).toBe('s1');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('request gửi bằng token cũ trong lúc token đã được làm mới → gửi lại luôn, không khôi phục nữa', async () => {
    server = async (call) => {
      if (call.auth === 'Bearer old') {
        mockSecure.set('accessToken', 'new'); // request khác vừa làm mới xong
        return { status: 401 };
      }
      return guarded('new')(call);
    };

    await expect(axiosInstance.get('/branches')).resolves.toMatchObject({ data: { ok: '/branches' } });
    expect(restoreCalls()).toHaveLength(0);
  });

  it('đăng xuất / đổi cửa hàng trong lúc đang khôi phục → không ghi lại token cũ', async () => {
    server = async (call) => {
      if (call.path === '/auth/restore-session') {
        // Người dùng bấm Đăng xuất: máy xoá phiên trước khi server trả lời.
        mockSecure.delete('accessToken');
        mockSecure.delete('refreshToken');
        mockSecure.delete('sessionToken');
        return { status: 200, data: { token: 'new', refreshToken: 'r2' } };
      }
      return guarded('new')(call);
    };

    await expect(axiosInstance.get('/users/me')).rejects.toEqual({ title: 'Unauthorized' });
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.has('sessionToken')).toBe(false);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('không có phiên để khôi phục mà token bị từ chối → xoá token, đăng xuất (cửa hàng vẫn nhớ)', async () => {
    mockSecure.delete('sessionToken');
    server = guarded('new');

    await expect(axiosInstance.get('/users/me')).rejects.toEqual({ title: 'Unauthorized' });
    expect(restoreCalls()).toHaveLength(0);
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.get('storeProfile')).toContain('shop1');
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('chưa đăng nhập (không token, không phiên) → 401 trả lỗi bình thường, không báo gì', async () => {
    mockSecure.clear();
    server = guarded('new');

    await expect(axiosInstance.get('/users/me')).rejects.toEqual({ title: 'Unauthorized' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.auth).toBeNull();
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('restoreSession', () => {
  it('khôi phục được → lưu token mới (và sessionToken nếu server đổi)', async () => {
    server = () => ({ status: 200, data: { token: 'new', refreshToken: 'r2', sessionToken: 's2' } });
    await expect(restoreSession()).resolves.toMatchObject({ kind: 'restored' });
    expect(mockSecure.get('accessToken')).toBe('new');
    expect(mockSecure.get('sessionToken')).toBe('s2');
    expect(calls[0]!.path).toBe('/auth/restore-session');
  });

  it('không có sessionToken → none, không gọi mạng', async () => {
    mockSecure.delete('sessionToken');
    await expect(restoreSession()).resolves.toEqual({ kind: 'none' });
    expect(calls).toHaveLength(0);
  });

  it('đổi cửa hàng trong lúc chờ → stale, không ghi token của cửa hàng cũ', async () => {
    server = async () => {
      mockHost = 'https://shop2.store.devbyspark.com/api';
      return { status: 200, data: { token: 'new', refreshToken: 'r2' } };
    };
    await expect(restoreSession()).resolves.toEqual({ kind: 'stale' });
    expect(mockSecure.get('accessToken')).toBe('old');
  });

  it('mất mạng → ném lỗi, giữ sessionToken cho lần sau', async () => {
    server = () => 'network';
    await expect(restoreSession()).rejects.toBeTruthy();
    expect(mockSecure.get('sessionToken')).toBe('s1');
  });
});

describe('helpers', () => {
  it.each([
    [400, true],
    [401, true],
    [403, true],
    [404, true],
    [408, false],
    [429, false],
    [500, false],
    [503, false],
    [undefined, false],
  ])('isAuthRejection(%s) = %s', (status, expected) => {
    expect(isAuthRejection(status)).toBe(expected);
  });

  it('isAnonymousAuthPath nhận cả đường dẫn tương đối lẫn URL đầy đủ, bỏ query', () => {
    expect(isAnonymousAuthPath('/auth/login')).toBe(true);
    expect(isAnonymousAuthPath('/auth/login?x=1')).toBe(true);
    expect(isAnonymousAuthPath('https://a.b.vn/api/auth/sso/exchange')).toBe(true);
    expect(isAnonymousAuthPath('/auth/logout')).toBe(false); // cần đăng nhập: hết hạn thì khôi phục rồi gửi lại
    expect(isAnonymousAuthPath('/auth/oauth-connections')).toBe(false);
    expect(isAnonymousAuthPath('/users/me')).toBe(false);
    expect(isAnonymousAuthPath(undefined)).toBe(false);
  });
});
