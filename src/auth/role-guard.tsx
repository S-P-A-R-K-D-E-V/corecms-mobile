import React from 'react';

import { Forbidden403 } from 'src/components/shared';
import { useAuthContext } from './auth-context';
import { hasAnyRole, hasAnyPermission } from './roles';

// ----------------------------------------------------------------------
// Cổng phân quyền cấp màn hình. Tương đương RoleBasedGuard bên core-fe:
// kiểm tra role/permission, không đủ quyền thì render UI 403.
// ----------------------------------------------------------------------

export type RoleGuardProps = {
  roles?: readonly string[];
  permissions?: readonly string[];
  children: React.ReactNode;
  /** UI hiển thị khi bị chặn. Mặc định là màn 403 toàn trang. */
  fallback?: React.ReactNode;
};

export function RoleGuard({ roles, permissions, children, fallback }: RoleGuardProps) {
  const { user } = useAuthContext();

  const allowed = hasAnyRole(user, roles) && hasAnyPermission(user, permissions);

  if (!allowed) {
    return <>{fallback ?? <Forbidden403 />}</>;
  }

  return <>{children}</>;
}
