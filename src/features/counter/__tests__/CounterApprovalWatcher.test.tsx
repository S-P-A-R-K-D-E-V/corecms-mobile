// Điện thoại của nhân viên: ai đó bấm tên mình trên máy quầy → app (đang mở / vừa mở) hiện mã 6 số + Đồng ý, không cần
// thông báo đẩy. Máy quầy (chế độ máy quầy) thì không hỏi.

jest.mock('src/components/overlay', () => ({ toast: { success: jest.fn(), info: jest.fn(), error: jest.fn() } }));
let mockAuthenticated = true;
jest.mock('src/auth/auth-context', () => ({ useAuthContext: () => ({ authenticated: mockAuthenticated }) }));
let mockCounter: object | null = null;
jest.mock('src/services/counter-mode', () => ({ useCounterMode: (pick: any) => pick({ device: mockCounter }) }));
jest.mock('src/api/counter', () => ({
  getMyCounterApprovals: jest.fn(),
  approveCounterLogin: jest.fn(() => Promise.resolve()),
  rejectCounterLogin: jest.fn(() => Promise.resolve()),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { approveCounterLogin, getMyCounterApprovals } from 'src/api/counter';
import { setLocale } from 'src/i18n';
import { CounterApprovalWatcher } from '../CounterApprovalWatcher';

beforeAll(() => setLocale('vi'));

const pending = {
  requestId: 'req-1',
  code: '482913',
  deviceName: 'Web quầy',
  branchName: 'Cửa hàng mẫu',
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};

describe('CounterApprovalWatcher', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticated = true;
    mockCounter = null;
  });

  it('shows the pending code and approves it', async () => {
    (getMyCounterApprovals as jest.Mock).mockResolvedValue([pending]);
    render(<CounterApprovalWatcher />);

    await waitFor(() => expect(screen.getByText('482 913')).toBeTruthy());
    expect(screen.getByText('Web quầy · Cửa hàng mẫu')).toBeTruthy();

    fireEvent.press(screen.getByText('Đồng ý đăng nhập'));
    await waitFor(() => expect(approveCounterLogin).toHaveBeenCalledWith('req-1'));
  });

  it('a counter device never asks for approvals', async () => {
    mockCounter = { deviceId: 'd1' };
    render(<CounterApprovalWatcher />);
    await new Promise((r) => setTimeout(r, 50));
    expect(getMyCounterApprovals).not.toHaveBeenCalled();
  });
});
