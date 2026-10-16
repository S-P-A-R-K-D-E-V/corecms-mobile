jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

let mockUser: any = null;
jest.mock('../auth-context', () => ({
  useAuthContext: () => ({ user: mockUser }),
}));

import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { router } from 'expo-router';

import { RoleGuard } from '../role-guard';
import { MANAGER_ROLES } from '../roles';

const mockRouter = router as unknown as { back: jest.Mock; replace: jest.Mock; canGoBack: jest.Mock };

// Màn 403 của RoleGuard có nút quay lại — trong Stack (/manage, /purchase-orders) trước đây người dùng bị kẹt.

beforeEach(() => jest.clearAllMocks());

describe('RoleGuard', () => {
  it('đủ vai trò → hiện màn hình; người kiêm nhiều vai trò xét đủ danh sách', () => {
    mockUser = { role: 'Staff', roles: ['Staff', 'Manager'] };
    render(
      <RoleGuard roles={MANAGER_ROLES}>
        <Text>màn quản lý</Text>
      </RoleGuard>
    );

    expect(screen.getByText('màn quản lý')).toBeTruthy();
  });

  it('thiếu vai trò → 403 có nút "Quay lại" về màn trước', () => {
    mockUser = { role: 'Staff', roles: ['Staff'] };
    render(
      <RoleGuard roles={MANAGER_ROLES}>
        <Text>màn quản lý</Text>
      </RoleGuard>
    );

    expect(screen.queryByText('màn quản lý')).toBeNull();
    fireEvent.press(screen.getByText('Quay lại'));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it('không còn màn trước (mở thẳng bằng link) → về trang chủ', () => {
    mockUser = { role: 'Staff', roles: ['Staff'] };
    mockRouter.canGoBack.mockReturnValueOnce(false);
    render(
      <RoleGuard roles={MANAGER_ROLES}>
        <Text>màn quản lý</Text>
      </RoleGuard>
    );

    fireEvent.press(screen.getByText('Quay lại'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
  });

  it('allPermissions: thiếu một quyền → 403; Admin luôn qua', () => {
    mockUser = { role: 'Staff', roles: ['Staff'], permissions: ['analytics.revenue.read'] };
    const view = render(
      <RoleGuard allPermissions={['analytics.revenue.read', 'analytics.payment-method.read']}>
        <Text>doanh thu</Text>
      </RoleGuard>
    );
    expect(screen.queryByText('doanh thu')).toBeNull();
    view.unmount();

    mockUser = { role: 'Admin', roles: ['Admin'], permissions: [] };
    render(
      <RoleGuard allPermissions={['analytics.revenue.read', 'analytics.payment-method.read']}>
        <Text>doanh thu</Text>
      </RoleGuard>
    );
    expect(screen.getByText('doanh thu')).toBeTruthy();
  });
});

