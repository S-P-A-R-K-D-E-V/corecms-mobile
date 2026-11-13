// ----------------------------------------------------------------------
// Thông báo đồng bộ KiotViet (category "Sync") chỉ vào danh sách, không bật thông báo hệ điều hành khi app đang mở —
// khớp core-be (không gửi push Expo cho loại này). Các loại khác giữ nguyên.
// ----------------------------------------------------------------------

jest.mock('@microsoft/signalr', () => ({}));
jest.mock('expo-notifications', () => ({ scheduleNotificationAsync: jest.fn() }));
jest.mock('src/auth/auth-context', () => ({ useAuthContext: () => ({ user: null }) }));
jest.mock('src/api/axios', () => ({ getHostApi: () => 'https://x' }));
jest.mock('src/api/session', () => ({ currentAccessToken: () => '' }));

// eslint-disable-next-line import/first
import { isSilentNotification } from '../use-notification-hub';

describe('isSilentNotification', () => {
  it('đồng bộ KiotViet là thông báo im lặng (không phân biệt hoa thường)', () => {
    expect(isSilentNotification({ category: 'Sync', type: 'Sync' })).toBe(true);
    expect(isSilentNotification({ type: 'sync' })).toBe(true);
  });

  it('các loại khác vẫn bật thông báo', () => {
    expect(isSilentNotification({ category: 'Shift', type: 'Shift' })).toBe(false);
    expect(isSilentNotification({ category: 'Order', type: 'Order' })).toBe(false);
    expect(isSilentNotification({ type: '' })).toBe(false);
  });
});
