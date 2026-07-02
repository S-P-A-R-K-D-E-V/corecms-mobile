import type { AuthUser } from './auth-context';

// ----------------------------------------------------------------------
// Phân quyền cho app nội bộ (internal staff app).
// App này chỉ dành cho cấp Staff / Manager / Admin — người dùng vai trò khác
// (vd. "User"/khách) đăng nhập được nhưng KHÔNG được truy cập dữ liệu hệ thống.
// ----------------------------------------------------------------------

/** Các vai trò được phép sử dụng app nội bộ. */
export const INTERNAL_APP_ROLES = ['Staff', 'Manager', 'Admin'] as const;

/** Vai trò được phép vào tính năng Kiểm tiền quầy (đồng bộ core-fe nav). */
export const SHIFT_CASH_ROLES = ['Staff', 'Manager', 'Admin'] as const;

/** Vai trò được thấy menu & Dashboard Quản trị — CHỈ Admin (theo dõi, full quyền). */
export const ADMIN_ROLES = ['Admin'] as const;

/**
 * Vai trò quản lý đội ngũ: xem lịch nhân viên, xếp ca, đổi ca hộ, duyệt yêu cầu.
 * Admin bao trùm quyền Manager (full quyền). Dùng cho các màn "Quản lý" (Phase 2).
 */
export const MANAGER_ROLES = ['Manager', 'Admin'] as const;

/** Gộp `role` (đơn) + `roles[]` thành 1 danh sách duy nhất, loại trùng. */
export function getUserRoles(user: AuthUser | null | undefined): string[] {
  if (!user) return [];
  const set = new Set<string>(user.roles ?? []);
  if (user.role) set.add(user.role);
  return [...set];
}

/** True nếu user có ÍT NHẤT một trong các vai trò yêu cầu (rỗng = cho qua). */
export function hasAnyRole(user: AuthUser | null | undefined, roles?: readonly string[]): boolean {
  if (!roles || roles.length === 0) return true;
  const userRoles = getUserRoles(user);
  return roles.some((r) => userRoles.includes(r));
}

/** True nếu user có ÍT NHẤT một trong các permission yêu cầu (rỗng = cho qua). */
export function hasAnyPermission(user: AuthUser | null | undefined, permissions?: readonly string[]): boolean {
  if (!permissions || permissions.length === 0) return true;
  const userPermissions = user?.permissions ?? [];
  return permissions.some((p) => userPermissions.includes(p));
}

/** Cổng chặn cấp app: user có được phép dùng app nội bộ này không. */
export function canUseInternalApp(user: AuthUser | null | undefined): boolean {
  return hasAnyRole(user, INTERNAL_APP_ROLES);
}

/** True nếu user là Quản trị viên — thấy menu riêng (Dashboard | Chat | Tôi). */
export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return hasAnyRole(user, ADMIN_ROLES);
}

/** True nếu user là cấp quản lý (Manager/Admin) — vào được các màn "Quản lý". */
export function isManagerUser(user: AuthUser | null | undefined): boolean {
  return hasAnyRole(user, MANAGER_ROLES);
}

/**
 * Màn hình "nhà" sau đăng nhập, theo role:
 *   Admin           → Dashboard quản trị
 *   Staff / Manager → Điểm danh (tab center hiện tại)
 * 1 tài khoản nhiều role: Admin thắng (menu quản trị là trải nghiệm chính).
 */
export function homeHref(user: AuthUser | null | undefined): string {
  return isAdminUser(user) ? '/(tabs)/admin' : '/(tabs)/checkin';
}
