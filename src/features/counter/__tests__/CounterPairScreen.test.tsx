// Máy chưa ai đăng nhập: xin mã ghép nối loại máy quầy, hiện 6 số; được duyệt thì bật chế độ máy quầy bằng key nhận được
// và sang màn chọn tên.

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ router: { replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() } }));
jest.mock('src/components/overlay', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('src/components/shared', () => {
  const { View } = jest.requireActual('react-native');
  return { Screen: ({ children }: any) => <View>{children}</View>, AppHeader: () => null };
});
jest.mock('src/api/counter', () => ({
  requestCounterPairing: jest.fn(),
  getCounterPairingStatus: jest.fn(),
}));
jest.mock('src/services/counter-mode', () => ({ enterCounterMode: jest.fn(() => Promise.resolve()) }));
jest.mock('src/services/store-config', () => ({ getStore: () => ({ name: 'Cửa hàng mẫu' }), getStoreCode: () => 'demo' }));

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';

import { getCounterPairingStatus, requestCounterPairing } from 'src/api/counter';
import { enterCounterMode } from 'src/services/counter-mode';
import { setLocale } from 'src/i18n';
import { CounterPairScreen } from '../CounterPairScreen';

beforeAll(() => setLocale('vi'));

describe('CounterPairScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (requestCounterPairing as jest.Mock).mockResolvedValue({ pairingId: 'p-secret', code: '482913', expiresAt: '' });
  });
  afterEach(() => jest.useRealTimers());

  it('shows the code and becomes a counter once a manager approves it', async () => {
    (getCounterPairingStatus as jest.Mock).mockResolvedValue({
      status: 'claimed',
      kioskKey: 'k-1',
      deviceId: 'dev-1',
      deviceName: 'Quầy 2',
      branchId: 'b1',
      branchName: 'Chi nhánh 1',
      deviceType: 'counter',
    });
    render(<CounterPairScreen />);

    await waitFor(() => expect(screen.getByText('482 913')).toBeTruthy());
    expect(requestCounterPairing).toHaveBeenCalledWith(expect.stringMatching(/android|ios/));
    expect(screen.queryByText(/p-secret/)).toBeNull();

    jest.advanceTimersByTime(2600);
    await waitFor(() => expect(enterCounterMode).toHaveBeenCalled());
    expect(enterCounterMode).toHaveBeenCalledWith(
      { deviceId: 'dev-1', deviceName: 'Quầy 2', branchId: 'b1', branchName: 'Chi nhánh 1', storeCode: 'demo' },
      'k-1'
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/counter'));
  });

  it('approved but the key went elsewhere: asks for a new code instead of pairing without a key', async () => {
    (getCounterPairingStatus as jest.Mock).mockResolvedValue({ status: 'claimed', kioskKey: null, deviceId: 'dev-1', branchId: 'b1' });
    render(<CounterPairScreen />);

    await waitFor(() => expect(screen.getByText('482 913')).toBeTruthy());
    jest.advanceTimersByTime(2600);
    await waitFor(() => expect(screen.getByText('Lấy mã mới')).toBeTruthy());
    expect(enterCounterMode).not.toHaveBeenCalled();
  });
});
