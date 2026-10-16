// Chế độ máy quầy: hạn phiên đọc từ exp của token; máy quầy của cửa hàng khác không được dùng ở cửa hàng hiện tại.

const mockSecure: Record<string, string> = {};
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockSecure[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    delete mockSecure[k];
  }),
}));
let mockStoreCode: string | null = 'cici';
jest.mock('src/services/store-config', () => ({ getStoreCode: () => mockStoreCode }));

import {
  enterCounterMode,
  getCounterKey,
  hydrateCounterMode,
  isCounterMode,
  leaveCounterMode,
  tokenExpiresAt,
  useCounterMode,
} from '../counter-mode';

function jwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'none' })}.${b64(payload)}.sig`;
}

const device = { deviceId: 'd1', deviceName: 'Quầy 1', branchId: 'b1', branchName: '21 Chùa Láng', storeCode: 'cici' };

describe('counter mode', () => {
  beforeEach(() => {
    for (const k of Object.keys(mockSecure)) delete mockSecure[k];
    mockStoreCode = 'cici';
    useCounterMode.setState({ hydrated: false, device: null });
  });

  it('reads the session end from the token exp', () => {
    expect(tokenExpiresAt(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
    expect(tokenExpiresAt('not-a-token')).toBeNull();
    expect(tokenExpiresAt(null)).toBeNull();
  });

  it('keeps the device key and comes back after restart', async () => {
    await enterCounterMode(device, 'key-123');
    expect(isCounterMode()).toBe(true);
    expect(await getCounterKey()).toBe('key-123');

    useCounterMode.setState({ hydrated: false, device: null });
    await hydrateCounterMode();
    expect(useCounterMode.getState().device).toEqual(device);
  });

  it('ignores a counter of another store', async () => {
    await enterCounterMode(device, 'key-123');
    mockStoreCode = 'other';
    await hydrateCounterMode();
    expect(useCounterMode.getState()).toEqual({ hydrated: true, device: null });
  });

  it('forgets the key when leaving', async () => {
    await enterCounterMode(device, 'key-123');
    await leaveCounterMode();
    expect(isCounterMode()).toBe(false);
    expect(await getCounterKey()).toBeNull();
  });
});
