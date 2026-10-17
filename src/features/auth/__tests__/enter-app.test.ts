const mockRouter = {
  canDismiss: jest.fn(() => true),
  dismissAll: jest.fn(),
  replace: jest.fn(),
};
jest.mock('expo-router', () => ({
  get router() {
    return mockRouter;
  },
}));

jest.mock('src/api/app-hub', () => ({
  newSsoState: () => 'state-0123456789abcdef',
  discoverStores: jest.fn(),
}));

import { enterApp, leaveToWelcome, useLeavingStore } from '../enter-app';
import { freshTicket, setDiscovered, useDiscovery } from '../discovery';
import type { DiscoveredStore, DiscoverResult } from 'src/api/app-hub';

// Vào app sau đăng nhập phải bỏ các màn đăng nhập phía dưới (Back không quay lại Chào mừng); rời cửa hàng để đổi tài
// khoản thì Chào mừng chỉ khoá nút trong lúc đăng xuất; Đổi cửa hàng (vé xin bằng phiên) tự xin lại vé khi quá hạn.

const store = (code: string, ssoCode: string): DiscoveredStore => ({
  code,
  name: code,
  logoUrl: null,
  primaryColor: null,
  host: `${code}.store.devbyspark.com`,
  webOrigin: `https://${code}.store.devbyspark.com`,
  apiBase: `https://${code}.store.devbyspark.com/api`,
  role: 'Admin',
  locale: 'vi',
  currency: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
  ssoCode,
});

const result = (ssoCode: string): DiscoverResult => ({
  email: 'linh@gmail.com',
  displayName: 'Linh',
  stores: [store('demo', ssoCode), store('sunrise', `${ssoCode}-2`)],
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  useDiscovery.setState({ pending: null, noStore: null });
});

describe('enterApp', () => {
  it('drops the sign-in screens underneath before going to the boot gate', () => {
    enterApp();
    expect(mockRouter.dismissAll).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
    expect(mockRouter.dismissAll.mock.invocationCallOrder[0]).toBeLessThan(mockRouter.replace.mock.invocationCallOrder[0]);
  });

  it('just replaces when there is nothing underneath', () => {
    mockRouter.canDismiss.mockReturnValueOnce(false);
    enterApp();
    expect(mockRouter.dismissAll).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});

describe('leaveToWelcome', () => {
  it('marks leaving only while the sign-out runs, even when it fails', async () => {
    let during = false;
    await leaveToWelcome(async () => {
      during = useLeavingStore.getState().leaving;
      throw new Error('offline');
    });
    expect(during).toBe(true);
    expect(useLeavingStore.getState().leaving).toBe(false);
    expect(mockRouter.replace).toHaveBeenCalledWith('/welcome');
  });
});

describe('store switch with the current session', () => {
  it('asks the session for new tickets once the first ones expire', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const renew = jest.fn(async () => ({ state: 'state-renewed-0123456789', result: result('fresh') }));
    setDiscovered('state-first-0123456789', 'session', result('first'), null, renew);

    expect(await freshTicket('sunrise')).toEqual({ store: store('sunrise', 'first-2'), state: 'state-first-0123456789' });
    expect(renew).not.toHaveBeenCalled();

    now.mockReturnValue(1_000_000 + 55_000);
    expect(await freshTicket('sunrise')).toEqual({ store: store('sunrise', 'fresh-2'), state: 'state-renewed-0123456789' });
    expect(renew).toHaveBeenCalledTimes(1);
    expect(useDiscovery.getState().pending?.state).toBe('state-renewed-0123456789');
  });

  it('gives up (sign in again) when there is no way to renew', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(2_000_000);
    setDiscovered('state-web-0123456789ab', 'google', result('web'));
    now.mockReturnValue(2_000_000 + 55_000);
    expect(await freshTicket('demo')).toBeNull();
  });
});
