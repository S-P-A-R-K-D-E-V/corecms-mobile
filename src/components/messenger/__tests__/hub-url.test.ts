// Hub SignalR theo cửa hàng: .env (commit, EAS/APK đều nạp) đặt EXPO_PUBLIC_SIGNALR_HUB_URL = hub của CiCi.
// Bản cửa hàng phải bỏ qua biến đó — nếu không, token cửa hàng khác bị TenantHubFilter của CiCi từ chối
// và chat / trợ lý thời gian thực chết. Bản CiCi vẫn dùng biến môi trường như trước.

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

// Store tin nhắn (zustand + immer bản ESM) không cần cho phép thử này.
jest.mock('src/store/messenger-store', () => ({ useMessengerStore: jest.fn() }));

const CICI_MESSENGER = 'https://cici21chualang.vn/api/hubs/messenger';
const CICI_ASSISTANT = 'https://cici21chualang.vn/api/hubs/chat';
const env = { ...process.env };

type Loaded = {
  messenger: typeof import('../messenger-provider');
  assistant: typeof import('src/components/assistant/assistant-provider');
  config: typeof import('src/services/store-config');
};

function load(variant: 'cici' | 'store'): Loaded {
  jest.resetModules();
  jest.doMock('expo-constants', () => ({
    __esModule: true,
    default: { expoConfig: { name: 'Spark Store', extra: { appVariant: variant } } },
  }));
  /* eslint-disable global-require */
  return {
    messenger: require('../messenger-provider'),
    assistant: require('src/components/assistant/assistant-provider'),
    config: require('src/services/store-config'),
  };
  /* eslint-enable global-require */
}

beforeEach(() => {
  mockSecure.clear();
  process.env.EXPO_PUBLIC_SIGNALR_HUB_URL = CICI_MESSENGER;
  process.env.EXPO_PUBLIC_ASSISTANT_HUB_URL = CICI_ASSISTANT;
});

afterAll(() => {
  process.env = env;
});

describe('hubUrl', () => {
  it('bản cửa hàng: bỏ qua URL cố định, đi theo gốc API của cửa hàng đang mở', async () => {
    const { messenger, assistant, config } = load('store');
    await config.setStore({
      code: 'demo',
      host: 'demo.store.devbyspark.com',
      name: 'Cửa hàng mẫu',
      logoUrl: null,
      primaryColor: null,
      locale: 'vi',
      currency: 'VND',
      timezone: 'Asia/Ho_Chi_Minh',
    });
    expect(messenger.hubUrl()).toBe('https://demo.store.devbyspark.com/api/hubs/messenger');
    expect(assistant.hubUrl()).toBe('https://demo.store.devbyspark.com/api/hubs/chat');
  });

  it('bản CiCi: giữ URL hub trong biến môi trường; không có thì theo gốc API', () => {
    let { messenger, assistant } = load('cici');
    expect(messenger.hubUrl()).toBe(CICI_MESSENGER);
    expect(assistant.hubUrl()).toBe(CICI_ASSISTANT);

    process.env.EXPO_PUBLIC_SIGNALR_HUB_URL = '';
    delete process.env.EXPO_PUBLIC_ASSISTANT_HUB_URL;
    ({ messenger, assistant } = load('cici'));
    expect(messenger.hubUrl()).toMatch(/\/hubs\/messenger$/);
    expect(messenger.hubUrl()).not.toBe('/hubs/messenger');
    expect(assistant.hubUrl()).toMatch(/\/hubs\/chat$/);
  });
});
