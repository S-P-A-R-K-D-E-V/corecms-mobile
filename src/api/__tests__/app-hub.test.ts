jest.mock('expo-crypto', () => ({ randomUUID: () => '0123-4567-89ab-cdef-0123-4567-89ab-cdef' }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import { DiscoverError, discoverStores, newSsoState } from '../app-hub';

function mockFetch(status: number, body: unknown) {
  (global as any).fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

describe('app-hub', () => {
  it('state đủ dài và chỉ gồm ký tự an toàn', () => {
    expect(newSsoState()).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });

  it('gửi state + thông tin đăng nhập tới auth hub và trả danh sách cửa hàng', async () => {
    mockFetch(200, { email: 'a@b.co', displayName: 'A', stores: [{ code: 'demo', ssoCode: 'x' }] });
    const result = await discoverStores('state-1234567890ab', { email: 'a@b.co', password: 'pw' });
    expect(result.stores).toHaveLength(1);
    const [url, init] = (global as any).fetch.mock.calls[0];
    expect(url).toBe('https://auth.devbyspark.com/api/app-hub/discover');
    expect(JSON.parse(init.body)).toEqual({ state: 'state-1234567890ab', email: 'a@b.co', password: 'pw' });
  });

  it.each([
    [400, { errors: { 'Auth.InvalidCred': ['x'] } }, 'invalid_credentials'],
    [400, { errors: { 'User.EmailNotVerified': ['x'] } }, 'email_not_verified'],
    [400, { errors: { 'User.AccountBanned': ['x'] } }, 'banned'],
    [400, { errors: { 'Auth.InvalidOAuthToken': ['x'] } }, 'invalid_token'],
    [429, null, 'rate_limited'],
  ])('lỗi %s → %s', async (status, body, code) => {
    mockFetch(status as number, body);
    await expect(discoverStores('state-1234567890ab', { email: 'a@b.co', password: 'pw' })).rejects.toMatchObject({ code });
  });

  it('mất mạng → network', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const err = await discoverStores('state-1234567890ab', { email: 'a@b.co', password: 'pw' }).catch((e) => e);
    expect(err).toBeInstanceOf(DiscoverError);
    expect(err.code).toBe('network');
  });
});
