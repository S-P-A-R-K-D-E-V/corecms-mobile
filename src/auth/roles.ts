import type { AuthUser } from './auth-context';
import { isMultiStore } from 'src/services/store-config';

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

/** True nếu dùng shell chủ cửa hàng (Hàng hoá / Bán hàng / Hoá đơn). Chỉ đúng với Admin thuần. */
export function usesAdminShell(user: AuthUser | null | undefined): boolean {
  return isPureAdmin(user);
}

/**
 * Màn hình "nhà" sau đăng nhập: trang chủ kiểu MB Bank cho mọi shell — nội dung đổi theo vai trò
 * (chủ cửa hàng: doanh thu; nhân viên: lương tạm tính, ca hôm nay).
 */
export function homeHref(_user?: AuthUser | null): string {
  return '/(tabs)/home';
}

/**
 * Quyền mở được công cụ đọc của trợ lý cửa hàng cho người không phải chủ / quản lý — vai trò tuỳ chỉnh (vd "Kế toán" được
 * cấp báo cáo doanh thu). Core-be StoreAssistantToolset quyết định đúng tool nào; đây chỉ để hiện ô / tab.
 */
const ASSISTANT_PERMISSION_PREFIXES = [
  'analytics.',
  'payroll.',
  'expense.',
  'cash-fund.',
  'cash-voucher.',
  'cash-flow-category.',
  'partner-voucher.',
];

/**
 * Có thấy tab Trợ lý AI không. Bản CiCi: mọi người (trợ lý nhân viên tự tra lương/lịch). Bản cửa hàng:
 * chủ/quản lý, hoặc vai trò tuỳ chỉnh được cấp báo cáo / tiền (trợ lý chỉ có tool đúng quyền đó — core-be
 * StoreAssistant; server không cho thì màn trợ lý báo không dùng được).
 */
export function canUseAssistant(user: AuthUser | null | undefined): boolean {
  if (!isMultiStore || isManagerUser(user)) return true;
  return (user?.permissions ?? []).some((code) => ASSISTANT_PERMISSION_PREFIXES.some((prefix) => code.startsWith(prefix)));
}

/** Cửa hàng đã bật trợ lý AI chưa (GET /users/me → enabledFeatures). Không có danh sách = chưa biết. */
export function assistantEnabled(user: AuthUser | null | undefined): boolean {
  if (!isMultiStore) return true;
  return user?.enabledFeatures ? user.enabledFeatures.includes('ai.assistant') : true;
}
