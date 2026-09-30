

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => {
      store.set(k, v);
    }),
    deleteItemAsync: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
});

function loadWithVariant(variant: 'cici' | 'store') {
  jest.resetModules();
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { name: 'Cửa hàng', extra: { appVariant: variant } } } }));
  // eslint-disable-next-line global-require
  const config = require('../index') as typeof import('../index');
  // Cùng registry với module vừa nạp (resetModules tạo bản mock mới).
  // eslint-disable-next-line global-require
  const secure = require('expo-secure-store') as typeof import('expo-secure-store');
  return Object.assign(config, { secure });
}

describe('normalizeStoreCode', () => {
  const { normalizeStoreCode } = loadWithVariant('store');

  it.each([
    ['tiemtocabc', 'tiemtocabc'],
    ['  TiemTocABC ', 'tiemtocabc'],
    ['tiemtocabc.store.devbyspark.com', 'tiemtocabc'],
    ['https://tiemtocabc.store.devbyspark.com/dashboard', 'tiemtocabc'],
    ['shop-2', 'shop-2'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeStoreCode(input)).toBe(expected);
  });

  it.each(['', 'ab', '-shop', 'shop-', 'shop_abc', 'a.b', 'evil.example.com', 'x'.repeat(40)])('từ chối %s', (input) => {
    expect(normalizeStoreCode(input)).toBeNull();
  });
});

describe('getHostApi', () => {
  it('bản CiCi luôn dùng địa chỉ cố định, không đọc mã cửa hàng', async () => {
    const config = loadWithVariant('cici');
    await config.secure.setItemAsync('storeCode', 'shop1');
    expect(await config.loadStoreCode()).toBeNull();
    expect(config.getHostApi()).not.toContain('shop1');
  });

  it('bản cửa hàng gọi API qua /api trên tên miền cửa hàng, web ở gốc', async () => {
    const config = loadWithVariant('store');
    await config.setStoreCode('shop1');
    expect(config.getHostApi()).toBe('https://shop1.store.devbyspark.com/api');
    expect(config.getWebOrigin()).toBe('https://shop1.store.devbyspark.com');
    expect(await config.loadStoreCode()).toBe('shop1');
  });

  it('bản build cũ chỉ lưu mã cửa hàng vẫn đọc được', async () => {
    const config = loadWithVariant('store');
    await config.secure.deleteItemAsync('storeProfile');
    await config.secure.setItemAsync('storeCode', 'oldshop');
    const store = await config.loadStore();
    expect(store?.host).toBe('oldshop.store.devbyspark.com');
    expect(config.getHostApi()).toBe('https://oldshop.store.devbyspark.com/api');
  });

  it('cửa hàng chọn từ app-hub giữ tên miền và tiền tệ của cửa hàng', async () => {
    const config = loadWithVariant('store');
    await config.setStore({
      code: 'cici68', host: 'CiCi21ChuaLang.vn', name: 'CiCi', logoUrl: null, primaryColor: null,
      locale: 'vi', currency: 'VND', timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(config.getHostApi()).toBe('https://cici21chualang.vn/api');
    expect(config.getStore()?.currency).toBe('VND');
  });

  it('từ chối host không hợp lệ (không để lọt vào URL)', async () => {
    const config = loadWithVariant('store');
    await config.setStore({
      code: 'x', host: 'evil.com/@attacker', name: null, logoUrl: null, primaryColor: null,
      locale: null, currency: null, timezone: null,
    });
    expect(config.getStore()).toBeNull();
  });

  it('đổi cửa hàng xoá token của cửa hàng cũ', async () => {
    const config = loadWithVariant('store');
    const SecureStore = config.secure;
    await SecureStore.setItemAsync('accessToken', 'a');
    await SecureStore.setItemAsync('refreshToken', 'r');
    await SecureStore.setItemAsync('sessionToken', 's');
    await SecureStore.setItemAsync('assistantSessionId', 'chat');

    await config.setStoreCode('shop2');

    expect(await SecureStore.getItemAsync('accessToken')).toBeNull();
    expect(await SecureStore.getItemAsync('refreshToken')).toBeNull();
    expect(await SecureStore.getItemAsync('sessionToken')).toBeNull();
    expect(await SecureStore.getItemAsync('assistantSessionId')).toBeNull();
    expect(config.getStoreCode()).toBe('shop2');
  });
});
