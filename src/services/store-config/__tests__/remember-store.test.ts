// Giữ cửa hàng trên máy: cửa hàng đã nhớ = cửa hàng VÀO GẦN NHẤT. Đăng xuất, hết phiên, "Đổi cửa hàng"
// đều không quên nó; chỉ thay khi vào được cửa hàng khác, chỉ quên hẳn khi xoá tài khoản.

// SecureStore giả sống qua các lần "mở lại app" (jest.resetModules) — như Keychain/Keystore thật.
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

type Config = typeof import('../index');
type Session = typeof import('src/api/session');

/** Mở app (lại): nạp module mới, đọc cửa hàng đã lưu như _layout.tsx. */
async function launch(): Promise<Config & { session: Session }> {
  jest.resetModules();
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { name: 'Spark Store', extra: { appVariant: 'store' } } },
  }));
  // eslint-disable-next-line global-require
  const config = require('../index') as Config;
  // eslint-disable-next-line global-require
  const session = require('src/api/session') as Session;
  await config.loadStore();
  return Object.assign(config, { session });
}

const profile = (code: string, name: string) => ({
  code,
  host: `${code}.store.devbyspark.com`,
  name,
  logoUrl: null,
  primaryColor: null,
  locale: 'vi',
  currency: 'VND',
  timezone: 'Asia/Ho_Chi_Minh',
});

/** Đăng nhập xong: máy có token của cửa hàng đang gắn. */
function signedIn() {
  mockSecure.set('accessToken', 'a');
  mockSecure.set('refreshToken', 'r');
  mockSecure.set('sessionToken', 's');
}

beforeEach(() => mockSecure.clear());

describe('cửa hàng đã nhớ', () => {
  it('đăng xuất / hết phiên chỉ xoá token — mở lại app vẫn về đúng cửa hàng', async () => {
    let app = await launch();
    await app.setStore(profile('shop1', 'Tiệm 1'));
    signedIn();

    await app.session.clearAuthTokens(); // logout() / axios hết phiên

    app = await launch();
    expect(app.getStoreCode()).toBe('shop1');
    expect(app.getStore()?.name).toBe('Tiệm 1');
    expect(app.getHostApi()).toBe('https://shop1.store.devbyspark.com/api');
    expect(mockSecure.has('accessToken')).toBe(false);
    expect(mockSecure.has('sessionToken')).toBe(false);
  });

  it('"Đổi cửa hàng" rồi bỏ dở → vẫn nhớ cửa hàng cũ; vào cửa hàng mới thì mới thay', async () => {
    let app = await launch();
    await app.setStore(profile('shop1', 'Tiệm 1'));
    signedIn();

    // Đổi cửa hàng = đăng xuất máy này rồi sang màn Chào mừng; người dùng thoát app giữa chừng.
    await app.session.clearAuthTokens();
    app = await launch();
    expect(app.getStoreCode()).toBe('shop1');

    // Lần này vào hẳn cửa hàng khác.
    signedIn();
    await app.setStore(profile('shop2', 'Tiệm 2'));
    expect(mockSecure.has('accessToken')).toBe(false); // không mang phiên cửa hàng cũ sang
    expect(mockSecure.has('sessionToken')).toBe(false);

    app = await launch();
    expect(app.getStoreCode()).toBe('shop2');
    expect(app.getHostApi()).toBe('https://shop2.store.devbyspark.com/api');
  });

  it('thông tin cửa hàng không hợp lệ → báo lỗi, giữ nguyên cửa hàng và phiên hiện tại', async () => {
    let app = await launch();
    await app.setStore(profile('shop1', 'Tiệm 1'));
    signedIn();

    await expect(app.setStore({ ...profile('x', 'X'), host: 'evil.com/@attacker' })).rejects.toThrow();
    expect(app.getStoreCode()).toBe('shop1');
    expect(mockSecure.get('sessionToken')).toBe('s');

    app = await launch();
    expect(app.getStoreCode()).toBe('shop1');
  });

  it('xoá tài khoản → quên hẳn cửa hàng và mọi token, mở lại app về màn Chào mừng', async () => {
    let app = await launch();
    await app.setStore(profile('shop1', 'Tiệm 1'));
    signedIn();
    mockSecure.set('storeCode', 'shop1'); // khoá của bản build cũ cũng phải đi

    await app.forgetStore();
    expect(app.getStore()).toBeNull();

    app = await launch();
    expect(app.getStore()).toBeNull();
    expect([...mockSecure.keys()]).toEqual([]);
  });
});

describe('trước khi sang cửa hàng khác', () => {
  it('việc của cửa hàng cũ chạy khi gốc API + token vẫn là của cửa hàng cũ; vào lại cùng cửa hàng thì không chạy', async () => {
    const app = await launch();
    await app.setStore(profile('shop1', 'Tiệm 1'));
    signedIn();
    const seen: string[] = [];
    const off = app.onBeforeStoreChange((next, previous) => {
      seen.push(`${previous.code}→${next.code} ${app.getHostApi()} token=${mockSecure.get('accessToken')}`);
    });

    await app.setStore(profile('shop1', 'Tiệm 1 (đổi tên)'));
    expect(seen).toEqual([]);

    signedIn(); // setStore luôn xoá token (kể cả cùng cửa hàng) — đăng nhập lại rồi mới đổi
    await app.setStore(profile('shop2', 'Tiệm 2'));
    expect(seen).toEqual(['shop1→shop2 https://shop1.store.devbyspark.com/api token=a']);
    expect(mockSecure.has('accessToken')).toBe(false);

    off();
    signedIn();
    await app.setStore(profile('shop3', 'Tiệm 3'));
    expect(seen).toHaveLength(1);
  });

  it('chưa gắn cửa hàng nào → không có gì để làm; việc lỗi không chặn đổi cửa hàng', async () => {
    const app = await launch();
    const listener = jest.fn(() => {
      throw new Error('hỏng');
    });
    app.onBeforeStoreChange(listener);
    await app.setStore(profile('shop1', 'Tiệm 1'));
    expect(listener).not.toHaveBeenCalled();

    await expect(app.setStore(profile('shop2', 'Tiệm 2'))).resolves.toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(app.getStoreCode()).toBe('shop2');
  });
});

describe('lastStoreFirst', () => {
  const stores = [{ code: 'shop1' }, { code: 'shop2' }, { code: 'shop3' }];

  it('cửa hàng đã nhớ lên đầu, thứ tự còn lại giữ nguyên', async () => {
    const app = await launch();
    await app.setStore(profile('shop3', 'Tiệm 3'));
    expect(app.lastStoreFirst(stores).map((s) => s.code)).toEqual(['shop3', 'shop1', 'shop2']);
    expect(stores.map((s) => s.code)).toEqual(['shop1', 'shop2', 'shop3']); // không sửa mảng gốc
  });

  it('không phân biệt hoa thường', async () => {
    const app = await launch();
    await app.setStore(profile('shop2', 'Tiệm 2'));
    expect(app.lastStoreFirst([{ code: 'shop1' }, { code: 'SHOP2' }]).map((s) => s.code)).toEqual(['SHOP2', 'shop1']);
  });

  it('chưa nhớ cửa hàng nào / cửa hàng đã nhớ không có trong danh sách → giữ nguyên thứ tự', async () => {
    let app = await launch();
    expect(app.lastStoreFirst(stores).map((s) => s.code)).toEqual(['shop1', 'shop2', 'shop3']);

    await app.setStore(profile('other', 'Khác'));
    app = await launch();
    expect(app.lastStoreFirst(stores).map((s) => s.code)).toEqual(['shop1', 'shop2', 'shop3']);
  });
});
