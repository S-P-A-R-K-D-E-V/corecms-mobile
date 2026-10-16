import React from 'react';
import { router, type Href } from 'expo-router';

import { Forbidden403 } from 'src/components/shared';
import { useAuthContext } from './auth-context';
import { homeHref, hasAnyRole } from './roles';
import { hasAnyPermission, hasAllPermissions } from './permissions';

// ----------------------------------------------------------------------
// Cổng phân quyền cấp màn hình. Tương đương RoleBasedGuard bên core-fe:
// kiểm tra role/permission, không đủ quyền thì render UI 403.
// ----------------------------------------------------------------------

export type RoleGuardProps = {
  roles?: readonly string[];
  /** Có MỘT trong các quyền (mã Core-be, xem src/auth/permissions.ts). Admin luôn đủ quyền. */
  permissions?: readonly string[];
  /** Có ĐỦ các quyền — màn gọi nhiều API, mỗi API một quyền. */
  allPermissions?: readonly string[];
  children: React.ReactNode;
  /** UI hiển thị khi bị chặn. Mặc định là màn 403 toàn trang. */
  fallback?: React.ReactNode;
};

/** Màn 403 mặc định có nút quay lại — trong Stack (/manage, /purchase-orders) trước đây người dùng bị kẹt. */
export function RoleGuardFallback() {
  const { user } = useAuthContext();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(homeHref(user) as Href);
  };

  return <Forbidden403 actionLabel="Quay lại" onAction={goBack} />;
}

export function RoleGuard({ roles, permissions, allPermissions, children, fallback }: RoleGuardProps) {
  const { user } = useAuthContext();

  const allowed =
    hasAnyRole(user, roles) && hasAnyPermission(user, permissions) && hasAllPermissions(user, allPermissions);

  if (!allowed) {
    return <>{fallback ?? <RoleGuardFallback />}</>;
  }

  return <>{children}</>;
}
