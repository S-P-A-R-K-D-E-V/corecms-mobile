// Bản cập nhật OTA: tải xong khi còn màn chờ thì áp ngay; đã vào app thì chờ app xuống nền mới áp (không khởi động lại
// giữa chừng — trước đây trông như app bị crash).

const mockUpdates = {
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
};
jest.mock('expo-updates', () => mockUpdates);

let appStateHandler: ((state: string) => void) | null = null;
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: (_: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove: jest.fn() };
    },
  },
}));

jest.mock('../../logger', () => ({ createLogger: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn() }) }));

type AppUpdate = typeof import('../index');

function load(): AppUpdate {
  let mod: AppUpdate | undefined;
  jest.isolateModules(() => {
    mod = require('../index');
  });
  return mod!;
}

const realDev = (global as any).__DEV__;
afterAll(() => {
  (global as any).__DEV__ = realDev;
});

beforeEach(() => {
  // Bản build thật (OTA chỉ chạy ngoài dev).
  (global as any).__DEV__ = false;
  jest.clearAllMocks();
  appStateHandler = null;
  mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
  mockUpdates.fetchUpdateAsync.mockResolvedValue({});
  mockUpdates.reloadAsync.mockResolvedValue(undefined);
});

describe('checkForUpdate', () => {
  it('applies right away while the splash screen is still up', async () => {
    const m = load();
    await expect(m.checkForUpdate()).resolves.toBe(true);
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('waits for the app to go to the background once the user is in the app', async () => {
    const m = load();
    m.markUiShown();
    await m.checkForUpdate();
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();

    appStateHandler?.('active');
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
    appStateHandler?.('background');
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
    // Chỉ áp một lần.
    appStateHandler?.('background');
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no update', async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const m = load();
    await expect(m.checkForUpdate()).resolves.toBe(false);
    expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled();
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled();
  });
});
