import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

import axiosInstance, { setSessionExpiredHandler } from 'src/api/axios';
import { isUsableToken, resumeSession } from '../resume-session';

// Mở app lấy lại phiên của máy: chỉ "đăng xuất" khi server từ chối phiên dứt khoát. Mất mạng / 5xx lúc mở
// app là "offline" — giữ nguyên mọi token (và cửa hàng đã nhớ) để thử lại, không đẩy người dùng ra ngoài.

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

let mockStoreCode: string | null = 'shop1';
jest.mock('src/services/store-config', () => ({
  isMultiStore: true,
  getHostApi: () => (mockStoreCode ? `https://${mockStoreCode}.store.devbyspark.com/api` : 'https://cici21chualang.vn/api'),
  getStoreCode: () => mockStoreCode,
}));

// ----------------------------------------------------------------------
// Server giả cho cả axiosInstance lẫn axios trần (restore-session).

type Reply = { status: number; data?: unknown } | 'network';
type Call = { path: string; auth: string | null };

let calls: Call[] = [];
let server: (call: Call) => Reply;

async function adapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  const url = /^https?:/.test(config.url ?? '') ? config.url! : `${config.baseURL ?? ''}${config.url ?? ''}`;
  const call: Call = {
    path: url.replace(/^https?:\/\/[^/]+\/api/, ''),
    auth: ((config.headers as any)?.Authorization as string | undefined) ?? null,
  };
  calls.push(call);
  const reply = server(call);
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

/** JWT giả hết hạn sau `seconds` giây (âm = đã hết hạn). */
function jwt(seconds: number, sub = 'u1') {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${enc({ alg: 'none' })}.${enc({ sub, exp: Math.floor(Date.now() / 1000) + seconds })}.sig`;
}

const VALID = jwt(3600);
const EXPIRED = jwt(-60);
const RESTORED = jwt(86_400, 'u1-new');
const ME = { id: 'u1', email: 'a@b.vn', firstName: 'A', lastName: 'B', roles: ['Staff'] };
const STORE = '{"code":"shop1","host":"shop1.store.devbyspark.com"}';

const restoreCalls = () => calls.filter((c) => c.path === '/auth/restore-session');
const meCalls = () => calls.filter((c) => c.path === '/users/me');

/** /users/me chỉ nhận đúng token `valid`; restore-session trả `restore`. */
const backend =
  (valid: string, restore: Reply = { status: 200, data: { token: RESTORED, refreshToken: 'r2', id: 'u1', firstName: 'A', lastName: 'B' } }) =>
  (call: Call): Reply => {
    if (call.path === '/auth/restore-session') return restore;
    if (call.path === '/users/me') return call.auth === `Bearer ${valid}` ? { status: 200, data: ME } : { status: 401 };
    return { status: 404 };
  };

const onExpired = jest.fn();

beforeEach(() => {
  mockStoreCode = 'shop1';
  mockSecure.clear();
  mockSecure.set('storeProfile', STORE);
  mockSecure.set('refreshToken', 'r1');
  mockSecure.set('sessionToken', 's1');
  calls = [];
  onExpired.mockReset();
  setSessionExpiredHandler(onExpired);
  axiosInstance.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
});

afterAll(() => setSessionExpiredHandler(null));

describe('accessToken còn hạn', () => {
  beforeEach(() => mockSecure.set('accessToken', VALID));

  it('server nhận → ok kèm hồ sơ, không khôi phục', async () => {
    server = backend(VALID);
    await expect(resumeSession()).resolves.toMatchObject({ kind: 'ok', accessToken: VALID, me: ME, auth: null });
    expect(restoreCalls()).toHaveLength(0);
  });

  it.each([
    ['mất mạng', 'network' as const],
    ['server lỗi 503', { status: 503, data: '<html>Bad gateway</html>' }],
    ['server lỗi 500 (ProblemDetails)', { status: 500, data: { status: 500, title: 'Server error' } }],
  ])('%s → offline, giữ nguyên mọi token và cửa hàng', async (_label, reply) => {
    server = () => reply;
    await expect(resumeSession()).resolves.toEqual({ kind: 'offline' });
    expect(mockSecure.get('accessToken')).toBe(VALID);
    expect(mockSecure.get('sessionToken')).toBe('s1');
    expect(mockSecure.get('storeProfile')).toBe(STORE);
  });

  it('token bị từ chối (401) → khôi phục bằng phiên máy rồi gọi lại → ok với token mới', async () => {
    server = backend(RESTORED);
    await expect(resumeSession()).resolves.toMatchObject({ kind: 'ok', accessToken: RESTORED, me: ME });
    expect(restoreCalls()).toHaveLength(1);
    expect(meCalls()).toHaveLength(2);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('401 và server từ chối phiên → signed-out, token đã xoá, cửa hàng vẫn nhớ', async () => {
    server = backend(RESTORED, { status: 401, data: { status: 401, title: 'Invalid session' } });
    await expect(resumeSession()).resolves.toEqual({ kind: 'signed-out' });
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.has('sessionToken')).toBe(false);
    expect(mockSecure.get('storeProfile')).toBe(STORE);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('401 mà khôi phục bị mất mạng → offline (chưa phải bị đăng xuất), giữ token', async () => {
    server = (call) =>
      call.path === '/auth/restore-session' ? 'network' : { status: 401, data: { status: 401, title: 'Unauthorized' } };
    await expect(resumeSession()).resolves.toEqual({ kind: 'offline' });
    expect(mockSecure.get('accessToken')).toBe(VALID);
    expect(mockSecure.get('sessionToken')).toBe('s1');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('server trả lời rõ ràng 403 → signed-out (không tự thử lại), không xoá token', async () => {
    server = () => ({ status: 403, data: { status: 403, title: 'Forbidden' } });
    await expect(resumeSession()).resolves.toEqual({ kind: 'signed-out' });
    expect(mockSecure.get('sessionToken')).toBe('s1');
  });
});

describe('accessToken hết hạn / không có', () => {
  it('hết hạn → khôi phục bằng phiên máy (một lần), đọc hồ sơ bằng token mới', async () => {
    mockSecure.set('accessToken', EXPIRED);
    server = backend(RESTORED);
    const result = await resumeSession();
    expect(result).toMatchObject({ kind: 'ok', accessToken: RESTORED, refreshToken: 'r2', me: ME });
    expect(result.kind === 'ok' && result.auth?.token).toBe(RESTORED);
    expect(restoreCalls()).toEqual([{ path: '/auth/restore-session', auth: null }]);
    expect(meCalls()[0]!.auth).toBe(`Bearer ${RESTORED}`);
    expect(mockSecure.get('accessToken')).toBe(RESTORED);
  });

  it('khôi phục được nhưng /users/me lỗi mạng → vẫn ok (dựng tạm từ phản hồi khôi phục)', async () => {
    mockSecure.set('accessToken', EXPIRED);
    server = (call) => (call.path === '/users/me' ? 'network' : backend(RESTORED)(call));
    await expect(resumeSession()).resolves.toMatchObject({ kind: 'ok', me: null, auth: { id: 'u1' } });
  });

  it.each([
    ['mất mạng', 'network' as const],
    ['server lỗi 502', { status: 502 }],
    ['quá tải 429', { status: 429 }],
  ])('khôi phục gặp %s → offline, giữ sessionToken cho lần thử sau', async (_label, reply) => {
    mockSecure.set('accessToken', EXPIRED);
    server = backend(RESTORED, reply);
    await expect(resumeSession()).resolves.toEqual({ kind: 'offline' });
    expect(mockSecure.get('sessionToken')).toBe('s1');
    expect(mockSecure.get('storeProfile')).toBe(STORE);
  });

  it('server từ chối phiên (4xx) → signed-out, xoá token, cửa hàng vẫn nhớ', async () => {
    mockSecure.set('accessToken', EXPIRED);
    server = backend(RESTORED, { status: 401 });
    await expect(resumeSession()).resolves.toEqual({ kind: 'signed-out' });
    expect(mockSecure.has('sessionToken')).toBe(false);
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.get('storeProfile')).toBe(STORE);
  });

  it('máy chưa có phiên nào → signed-out, không gọi mạng', async () => {
    mockSecure.delete('sessionToken');
    mockSecure.delete('refreshToken');
    server = backend(RESTORED);
    await expect(resumeSession()).resolves.toEqual({ kind: 'signed-out' });
    expect(calls).toHaveLength(0);
  });
});

describe('bản cửa hàng chưa gắn cửa hàng nào', () => {
  it.each([
    ['accessToken còn hạn', VALID],
    ['accessToken hết hạn', EXPIRED],
  ])('%s → signed-out, KHÔNG gửi token/phiên sang địa chỉ dự phòng', async (_label, token) => {
    mockStoreCode = null; // vd đọc storeProfile lỗi lúc mở app
    mockSecure.set('accessToken', token);
    server = backend(token === VALID ? VALID : RESTORED);
    await expect(resumeSession()).resolves.toEqual({ kind: 'signed-out' });
    expect(calls).toHaveLength(0);
    expect(mockSecure.get('sessionToken')).toBe('s1');
  });
});

describe('isUsableToken', () => {
  it.each([
    [VALID, true],
    [EXPIRED, false],
    ['không-phải-jwt', false],
    ['', false],
    [null, false],
  ])('%s → %s', (token, expected) => {
    expect(isUsableToken(token)).toBe(expected);
  });
});
