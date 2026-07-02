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

/** Vai trò được xem Dashboard & nhóm tiện ích "Quản trị" — CHỈ Admin. */
export const ADMIN_ROLES = ['Admin'] as const;

/**
 * Vai trò quản lý đội ngũ: xem lịch nhân viên, xếp ca, đổi ca hộ, duyệt yêu cầu.
 * Admin bao trùm quyền Manager (full quyền). Dùng cho nhóm tiện ích "Quản lý".
 */
export const MANAGER_ROLES = ['Manager', 'Admin'] as const;

/**
 * Vai trò vận hành sàn (tự chấm công / trực tiếp làm & giám sát ca) → dùng shell
 * 5 tab nhân viên. Ai có Staff HOẶC Manager đều thuộc nhóm này.
 */
export const SHIFT_FLOOR_ROLES = ['Staff', 'Manager'] as const;

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

/** True nếu user có quyền Quản trị (thấy Dashboard + nhóm tiện ích "Quản trị"). */
export function isAdminUser(user: AuthUser | null | undefined): boolean {
  return hasAnyRole(user, ADMIN_ROLES);
}

/** True nếu user là cấp quản lý (Manager/Admin) — thấy nhóm tiện ích "Quản lý". */
export function isManagerUser(user: AuthUser | null | undefined): boolean {
  return hasAnyRole(user, MANAGER_ROLES);
}

/**
 * "Admin thuần" = chỉ có quyền Admin, KHÔNG kiêm Staff/Manager (không làm ca).
 * Đây là nhóm duy nhất dùng shell Dashboard 3 tab; mọi người khác dùng shell
 * nhân viên 5 tab (Manager & Admin-kiêm-ca vẫn cần tự chấm công/xem ca).
 */
export function isPureAdmin(user: AuthUser | null | undefined): boolean {
  return isAdminUser(user) && !hasAnyRole(user, SHIFT_FLOOR_ROLES);
}

/** True nếu dùng shell Dashboard (3 tab). Chỉ đúng với Admin thuần. */
export function usesAdminShell(user: AuthUser | null | undefined): boolean {
  return isPureAdmin(user);
}

/**
 * Màn hình "nhà" sau đăng nhập, theo shell điều hướng:
 *   Admin thuần                       → Dashboard quản trị (3 tab)
 *   Staff / Manager / Admin-kiêm-ca   → Điểm danh (shell 5 tab)
 */
export function homeHref(user: AuthUser | null | undefined): string {
  return usesAdminShell(user) ? '/(tabs)/admin' : '/(tabs)/checkin';
}
