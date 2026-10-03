import { act, renderHook, waitFor } from '@testing-library/react-native';

// ----------------------------------------------------------------------
// Push theo cửa hàng: đăng ký token ở cửa hàng ĐANG đăng nhập mỗi lần vào cửa hàng / mở app khi đã đăng nhập;
// huỷ ở cửa hàng cũ (khi token đăng nhập của nó còn) trước khi rời nó. Huỷ lỗi không chặn đổi cửa hàng.
// ----------------------------------------------------------------------

const mockSecure = new Map<string, string>();
const mockCalls: string[] = [];
let mockUser: { id: string } | null = null;

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSecure.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    mockSecure.set(k, v);
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    mockSecure.delete(k);
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { name: 'Spark Store', extra: { appVariant: 'store', eas: { projectId: 'p1' } } } },
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[may-1]' })),
  setNotificationChannelAsync: jest.fn(async () => null),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));

// Ghi lại lệnh gọi kèm gốc API + token đăng nhập lúc gọi (axios đọc cả hai lúc gửi).
jest.mock('src/api/notifications', () => {
  // eslint-disable-next-line global-require
  const host = () => (require('src/services/store-config') as typeof import('src/services/store-config')).getHostApi();
  return {
    registerPushToken: jest.fn(async (token: string, platform: string) => {
      mockCalls.push(`POST ${host()}/notifications/push-token ${token} ${platform}`);
    }),
    unregisterPushToken: jest.fn(async (token: string) => {
      mockCalls.push(`DELETE ${host()}/notifications/push-token ${token} auth=${mockSecure.get('accessToken') ?? '-'}`);
    }),
  };
});

jest.mock('src/auth/auth-context', () => ({ useAuthContext: () => ({ user: mockUser }) }));

import * as notificationsApi from 'src/api/notifications';
import { getStoreCode, setStore } from 'src/services/store-config';
import { unregisterCurrentPushToken, usePushRegistration } from '../use-push-registration';

const TOKEN = 'ExponentPushToken[may-1]';

const profile = (code: string) => ({
  code,
  host: `${code}.store.devbyspark.com`,
  name: code,
  logoUrl: null,
  primaryColor: null,
  locale: 'vi',
  currency: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
});

function signedIn(token = 'a') {
  mockSecure.set('accessToken', token);
  mockSecure.set('sessionToken', 's');
}

beforeEach(() => {
  mockSecure.clear();
  mockCalls.length = 0;
  mockUser = null;
  jest.mocked(notificationsApi.unregisterPushToken).mockClear();
});

describe('đăng ký token theo cửa hàng', () => {
  it('mở app khi đã đăng nhập → đăng ký ở cửa hàng đang gắn; đổi cửa hàng (cùng id người dùng) → đăng ký lại ở cửa hàng mới', async () => {
    await setStore(profile('shopa'));
    signedIn();
    mockUser = { id: 'u1' };
    const { rerender } = renderHook(() => usePushRegistration());
    await waitFor(() => expect(mockCalls).toEqual([`POST https://shopa.store.devbyspark.com/api/notifications/push-token ${TOKEN} ios`]));
    expect(mockSecure.get('expoPushToken')).toBe(TOKEN);

    // "Đổi cửa hàng": đăng xuất (logout() huỷ trước khi xoá token) → Chào mừng → vào cửa hàng B.
    await act(async () => {
      await unregisterCurrentPushToken();
    });
    mockSecure.delete('accessToken');
    mockUser = null;
    rerender({});
    await act(async () => {
      await setStore(profile('shopb'));
    });
    signedIn('b');
    mockUser = { id: 'u1' }; // tài khoản chung qua auth hub: id có thể trùng
    rerender({});

    await waitFor(() => expect(mockCalls).toHaveLength(3));
    expect(mockCalls).toEqual([
      `POST https://shopa.store.devbyspark.com/api/notifications/push-token ${TOKEN} ios`,
      `DELETE https://shopa.store.devbyspark.com/api/notifications/push-token ${TOKEN} auth=a`,
      `POST https://shopb.store.devbyspark.com/api/notifications/push-token ${TOKEN} ios`,
    ]);
  });

  it('chưa đăng nhập → không đăng ký', async () => {
    await setStore(profile('shopc'));
    renderHook(() => usePushRegistration());
    await act(async () => {});
    expect(mockCalls).toEqual([]);
  });
});

describe('huỷ đăng ký ở cửa hàng cũ', () => {
  it('sang cửa hàng khác khi còn đăng nhập → DELETE ở cửa hàng cũ bằng token cũ, TRƯỚC khi token bị xoá', async () => {
    await setStore(profile('shopd'));
    signedIn('token-d');
    mockSecure.set('expoPushToken', TOKEN);

    await setStore(profile('shope'));

    expect(mockCalls).toEqual([`DELETE https://shopd.store.devbyspark.com/api/notifications/push-token ${TOKEN} auth=token-d`]);
    expect(getStoreCode()).toBe('shope');
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.has('expoPushToken')).toBe(false);
  });

  it('vào lại đúng cửa hàng đang gắn → không huỷ', async () => {
    await setStore(profile('shopf'));
    signedIn();
    mockSecure.set('expoPushToken', TOKEN);
    await setStore(profile('shopf'));
    expect(mockCalls).toEqual([]);
  });

  it('đã mất phiên (không còn token đăng nhập) → không gọi huỷ, vẫn đổi cửa hàng', async () => {
    await setStore(profile('shopg'));
    mockSecure.set('expoPushToken', TOKEN);
    await setStore(profile('shoph'));
    expect(mockCalls).toEqual([]);
    expect(getStoreCode()).toBe('shoph');
  });

  it('huỷ lỗi → vẫn đổi cửa hàng; giữ token push để lần sau đăng ký đè', async () => {
    await setStore(profile('shopi'));
    signedIn();
    mockSecure.set('expoPushToken', TOKEN);
    jest.mocked(notificationsApi.unregisterPushToken).mockRejectedValueOnce(new Error('mất mạng'));

    await setStore(profile('shopj'));
    expect(getStoreCode()).toBe('shopj');
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.get('expoPushToken')).toBe(TOKEN);
  });

  it('server không trả lời → chờ tối đa 10 giây rồi vẫn đổi cửa hàng', async () => {
    await setStore(profile('shopk'));
    signedIn();
    mockSecure.set('expoPushToken', TOKEN);
    jest.mocked(notificationsApi.unregisterPushToken).mockImplementationOnce(() => new Promise<void>(() => {}));

    jest.useFakeTimers();
    try {
      let done = false;
      const switching = setStore(profile('shopl')).then(() => {
        done = true;
      });
      await jest.advanceTimersByTimeAsync(9_000);
      expect(done).toBe(false);
      await jest.advanceTimersByTimeAsync(1_500);
      await switching;
      expect(done).toBe(true);
      expect(getStoreCode()).toBe('shopl');
    } finally {
      jest.useRealTimers();
    }
  });
});
