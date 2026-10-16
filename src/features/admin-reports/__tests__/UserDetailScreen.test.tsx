jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ userId: 'u-1', name: 'Lan' }),
}));

jest.mock('src/components/overlay', () => ({
  confirm: jest.fn(async () => true),
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() },
}));

jest.mock('src/auth/auth-context', () => ({
  useAuthContext: () => ({ user: { id: 'admin-1', role: 'Admin', roles: ['Admin'] } }),
}));

const mockAssign = jest.fn(async () => undefined);
const mockSetCustom = jest.fn(async () => undefined);
let mockAssignment: any = { data: { systemRoles: [], customRoleIds: ['c-cashier'] }, isLoading: false, isError: false };

jest.mock('../hooks', () => ({
  useUser: () => ({
    data: {
      id: 'u-1', fullName: 'Lan', email: 'lan@x.vn', createdAt: '2026-01-01', status: 'Active',
      // Danh sách vai trò trong token có cả vai trò gốc (Staff) của "Thu ngân".
      role: 'Staff', roles: ['Staff'],
    },
    isLoading: false, isError: false, isFetching: false, refetch: jest.fn(),
  }),
  useRoles: () => ({
    data: [
      { id: 'r-admin', name: 'Admin', isActive: true, userCount: 1, permissions: [] },
      { id: 'r-staff', name: 'Staff', isActive: true, userCount: 3, permissions: [] },
    ],
    isLoading: false, isError: false, refetch: jest.fn(),
  }),
  useCustomRoles: () => ({
    data: [
      { id: 'c-cashier', name: 'Thu ngân', baseRole: 'Staff', permissions: [], userCount: 1 },
      { id: 'c-acc', name: 'Kế toán', baseRole: 'Staff', permissions: ['analytics.revenue.read'], userCount: 0 },
    ],
  }),
  useUserRoleAssignment: () => mockAssignment,
  useChangeUserStatus: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useAssignRoles: () => ({ mutateAsync: mockAssign, isPending: false }),
  useSetUserCustomRoles: () => ({ mutateAsync: mockSetCustom, isPending: false }),
}));

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { UserDetailScreen } from '../UserDetailScreen';

// Gán vai trò trên app: vai trò hệ thống + vai trò tuỳ chỉnh, tích theo vai trò ĐƯỢC GÁN (không theo vai trò gốc trong
// token), chỉ gửi phần đã đổi.

beforeEach(() => {
  jest.clearAllMocks();
  mockAssignment = { data: { systemRoles: [], customRoleIds: ['c-cashier'] }, isLoading: false, isError: false };
});

describe('UserDetailScreen — vai trò', () => {
  it('đổi vai trò tuỳ chỉnh chỉ gọi API vai trò tuỳ chỉnh (không biến "Thu ngân" thành Staff hệ thống)', async () => {
    render(<UserDetailScreen />);

    fireEvent.press(screen.getByText('Kế toán'));
    fireEvent.press(screen.getByText('Lưu vai trò'));

    await waitFor(() => expect(mockSetCustom).toHaveBeenCalledWith({ userId: 'u-1', customRoleIds: ['c-cashier', 'c-acc'] }));
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it('server chưa có vai trò tuỳ chỉnh → đọc vai trò như cũ, ẩn mục vai trò tuỳ chỉnh', async () => {
    mockAssignment = { data: undefined, isLoading: false, isError: true };
    render(<UserDetailScreen />);

    expect(screen.queryByText('Vai trò tuỳ chỉnh của cửa hàng')).toBeNull();
    // Staff (từ user.roles) đang được tích → bỏ tích rồi lưu = gửi danh sách rỗng qua /roles/assign.
    fireEvent.press(screen.getByText('Staff'));
    fireEvent.press(screen.getByText('Lưu vai trò'));

    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith({ userId: 'u-1', roleIds: [] }));
    expect(mockSetCustom).not.toHaveBeenCalled();
  });
});
