import React from 'react';
import { Redirect } from 'expo-router';

import { Forbidden403, Loading } from 'src/components/shared';
import { useAuthContext } from './auth-context';
import { canUseInternalApp } from './roles';

// ----------------------------------------------------------------------
// Cổng chặn cấp app dùng chung cho mọi route truy cập dữ liệu hệ thống:
//   - đang tải session  → splash
//   - chưa đăng nhập     → về /login (kể cả khi deep-link thẳng vào route)
//   - không đủ vai trò   → UI 403 (chỉ Staff/Manager/Admin được vào)
// ----------------------------------------------------------------------

export function InternalAppGuard({ children }: { children: React.ReactNode }) {
  const { loading, authenticated, user, logout } = useAuthContext();

  if (loading) return <Loading />;
  if (!authenticated) return <Redirect href="/(auth)/login" />;

  if (!canUseInternalApp(user)) {
    return (
      <Forbidden403
        title="Ứng dụng nội bộ"
        description={
          'Ứng dụng này chỉ dành cho nhân viên (Staff), quản lý (Manager) và quản trị viên (Admin).\n' +
          'Tài khoản của bạn chưa được cấp quyền truy cập.'
        }
        onLogout={logout}
      />
    );
  }

  return <>{children}</>;
}
