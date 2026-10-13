jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}));

jest.mock('src/components/overlay', () => ({
  confirm: jest.fn(),
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

jest.mock('src/api/login-sessions', () => ({
  getLoginSessions: jest.fn(),
  revokeLoginSession: jest.fn(),
  revokeOtherLoginSessions: jest.fn(),
}));

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { confirm, toast } from 'src/components/overlay';
import { getLoginSessions, revokeLoginSession, revokeOtherLoginSessions } from 'src/api/login-sessions';
import { t } from 'src/i18n';
import { LoginSessionsScreen } from '../LoginSessionsScreen';

// Thiết bị đang đăng nhập: máy đang cầm được đánh dấu và không có nút đăng xuất ở đây; thiết bị khác chỉ bị đăng
// xuất sau khi người dùng xác nhận; "đăng xuất các thiết bị khác" chỉ có khi biết máy này là phiên nào.

const list = getLoginSessions as jest.Mock;
const revoke = revokeLoginSession as jest.Mock;
const revokeOthers = revokeOtherLoginSessions as jest.Mock;
const ask = confirm as jest.Mock;

const PHONE = {
  id: 'phone',
  device: 'App · Android',
  ipAddress: null,
  signedInAt: '2026-10-10T02:00:00Z',
  lastActiveAt: '2026-10-13T06:00:00Z',
  expiresAt: '2026-11-12T06:00:00Z',
  isCurrent: true,
  signedInWithQr: false,
};

const LAPTOP = {
  id: 'laptop',
  device: 'Chrome · Windows',
  ipAddress: '203.0.113.7',
  signedInAt: '2026-10-13T01:00:00Z',
  lastActiveAt: null,
  expiresAt: '2026-11-12T01:00:00Z',
  isCurrent: false,
  signedInWithQr: false,
};

const COUNTER_PC = {
  id: 'counter',
  device: null,
  ipAddress: '198.51.100.9',
  signedInAt: '2026-10-13T05:00:00Z',
  lastActiveAt: null,
  expiresAt: '2026-10-13T17:00:00Z',
  isCurrent: false,
  signedInWithQr: true,
};

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <LoginSessionsScreen />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  list.mockResolvedValue([PHONE, LAPTOP, COUNTER_PC]);
  revoke.mockResolvedValue(undefined);
  revokeOthers.mockResolvedValue(2);
  ask.mockResolvedValue(true);
});

describe('LoginSessionsScreen', () => {
  it('liệt kê thiết bị; máy đang cầm được đánh dấu và không có nút đăng xuất', async () => {
    renderScreen();

    expect(await screen.findByText('App · Android')).toBeTruthy();
    expect(screen.getByText('Chrome · Windows')).toBeTruthy();
    expect(screen.getByText(t('loginSessions.unknownDevice'))).toBeTruthy();
    expect(screen.getAllByText(t('loginSessions.thisDevice'))).toHaveLength(1);
    expect(screen.getByText(/IP 203\.0\.113\.7/)).toBeTruthy();
    // Phiên mã QR nói rõ lúc tự hết.
    expect(screen.getByText(new RegExp(t('loginSessions.endsAt', { time: '' }).trim()))).toBeTruthy();
    // Hai thiết bị kia mỗi cái một nút; máy này thì không.
    expect(screen.getAllByText(t('loginSessions.signOut'))).toHaveLength(2);
    expect(screen.getByText(t('loginSessions.signOutOthers'))).toBeTruthy();
  });

  it('đăng xuất một thiết bị: xác nhận xong mới gọi server đúng phiên, rồi tải lại danh sách', async () => {
    renderScreen();
    await screen.findByText('Chrome · Windows');
    list.mockResolvedValue([PHONE, COUNTER_PC]);

    fireEvent.press(screen.getAllByText(t('loginSessions.signOut'))[0]);

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('laptop'));
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      message: t('loginSessions.signOutMessage', { device: 'Chrome · Windows' }),
      destructive: true,
    }));
    await waitFor(() => expect(screen.queryByText('Chrome · Windows')).toBeNull());
    expect(toast.success).toHaveBeenCalledWith(t('loginSessions.signedOut', { device: 'Chrome · Windows' }));
    expect(revokeOthers).not.toHaveBeenCalled();
  });

  it('bấm Huỷ ở hộp xác nhận → không đăng xuất gì', async () => {
    ask.mockResolvedValue(false);
    renderScreen();
    await screen.findByText('Chrome · Windows');

    fireEvent.press(screen.getAllByText(t('loginSessions.signOut'))[0]);
    fireEvent.press(screen.getByText(t('loginSessions.signOutOthers')));

    await waitFor(() => expect(ask).toHaveBeenCalledTimes(2));
    expect(revoke).not.toHaveBeenCalled();
    expect(revokeOthers).not.toHaveBeenCalled();
  });

  it('đăng xuất các thiết bị khác: hỏi kèm số thiết bị, báo số đã đăng xuất', async () => {
    renderScreen();
    await screen.findByText('Chrome · Windows');
    list.mockResolvedValue([PHONE]);

    fireEvent.press(screen.getByText(t('loginSessions.signOutOthers')));

    await waitFor(() => expect(revokeOthers).toHaveBeenCalledTimes(1));
    expect(ask).toHaveBeenCalledWith(expect.objectContaining({
      message: t('loginSessions.signOutOthersMessage', { count: 2 }),
    }));
    await waitFor(() => expect(screen.queryByText(t('loginSessions.signOutOthers'))).toBeNull());
    expect(toast.success).toHaveBeenCalledWith(t('loginSessions.signedOutOthers', { count: 2 }));
    expect(revoke).not.toHaveBeenCalled();
  });

  it('không biết máy này là phiên nào → không có nút "các thiết bị khác" (sẽ tự đăng xuất chính mình)', async () => {
    list.mockResolvedValue([{ ...PHONE, isCurrent: false }, LAPTOP]);

    renderScreen();
    await screen.findByText('Chrome · Windows');

    expect(screen.queryByText(t('loginSessions.signOutOthers'))).toBeNull();
    expect(screen.queryByText(t('loginSessions.thisDevice'))).toBeNull();
    expect(screen.getAllByText(t('loginSessions.signOut'))).toHaveLength(2);
  });

  it('thiết bị vừa tự đăng xuất (404) → không báo lỗi, chỉ tải lại', async () => {
    revoke.mockRejectedValue({ status: 404, title: 'Không tìm thấy phiên', errorCodes: ['Auth.LoginSessionNotFound'] });
    renderScreen();
    await screen.findByText('Chrome · Windows');
    list.mockResolvedValue([PHONE, COUNTER_PC]);

    fireEvent.press(screen.getAllByText(t('loginSessions.signOut'))[0]);

    await waitFor(() => expect(screen.queryByText('Chrome · Windows')).toBeNull());
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('lỗi khác → báo thông điệp của server', async () => {
    revoke.mockRejectedValue({ status: 500, title: 'Máy chủ đang bận.' });
    renderScreen();
    await screen.findByText('Chrome · Windows');

    fireEvent.press(screen.getAllByText(t('loginSessions.signOut'))[0]);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Máy chủ đang bận.'));
  });

  it('không tải được danh sách → báo lỗi và cho thử lại', async () => {
    list.mockRejectedValue(new Error('Network Error'));

    renderScreen();

    expect(await screen.findByText(t('loginSessions.loadFailed'))).toBeTruthy();
    list.mockResolvedValue([PHONE]);
    fireEvent.press(screen.getByText(t('common.retry')));
    expect(await screen.findByText('App · Android')).toBeTruthy();
  });
});
