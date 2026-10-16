import type { AuthUser } from './auth-context';
import { getUserRoles } from './roles';

// ----------------------------------------------------------------------
// Mã quyền — trùng Core-be (CoreCms.Domain/Common/PermissionCatalog.cs, kiểm bằng [RequirePermission]) và core-fe
// (src/auth/permissions.ts). Quyền hiệu lực lấy từ GET /users/me → permissions; quyền thật do API quyết định.
// ----------------------------------------------------------------------

export const PERMISSIONS = {
  analytics: {
    dashboard: 'analytics.dashboard.read',
    revenue: 'analytics.revenue.read',
    productSales: 'analytics.product-sales.read',
    customer: 'analytics.customer.read',
    inventory: 'analytics.inventory.read',
    paymentMethod: 'analytics.payment-method.read',
    tax: 'analytics.tax.read',
    expense: 'analytics.expense.read',
    debt: 'analytics.debt.read',
    breakEven: 'analytics.break-even.read',
    financial: 'analytics.financial.read',
    employeeSales: 'analytics.employee-sales.read',
    saleChannel: 'analytics.sale-channel.read',
    export: 'analytics.export',
  },
  /**
   * Giám sát Kiểm quầy (trước đây cứng "chỉ Admin"). Xem: vào không cần ca / GPS, xem ngày cũ. Sửa (cần kèm xem): ghi
   * ngày cũ, sửa / xoá khoản của người khác, ghi khi không có ca.
   */
  shiftCash: {
    oversightRead: 'shift-cash.oversight.read',
    oversightManage: 'shift-cash.oversight.manage',
  },
} as const;

const A = PERMISSIONS.analytics;

/** Quyền của từng màn báo cáo trong app = quyền của các API màn đó gọi. */
export const REPORT_SCREEN_PERMISSIONS = {
  revenue: [A.revenue, A.paymentMethod],
  financialOverview: [A.revenue, A.expense, A.breakEven],
  breakEven: [A.breakEven],
} as const satisfies Record<string, readonly string[]>;

/** Có MỘT trong các quyền này là vào được nhóm báo cáo của stack Quản trị. */
export const ANY_REPORT_PERMISSION: readonly string[] = Array.from(
  new Set(Object.values(REPORT_SCREEN_PERMISSIONS).flat())
);

/** Admin (chủ cửa hàng) có mọi quyền — như API (quyền mặc định của Admin là "*"). */
export function hasPermission(user: AuthUser | null | undefined, code: string): boolean {
  if (!user) return false;
  return getUserRoles(user).includes('Admin') || (user.permissions ?? []).includes(code);
}

/** Có MỘT trong các quyền; không khai báo = không giới hạn. */
export function hasAnyPermission(user: AuthUser | null | undefined, codes?: readonly string[]): boolean {
  if (!codes || codes.length === 0) return true;
  return codes.some((c) => hasPermission(user, c));
}

/** Có ĐỦ các quyền; không khai báo = không giới hạn. */
export function hasAllPermissions(user: AuthUser | null | undefined, codes?: readonly string[]): boolean {
  if (!codes || codes.length === 0) return true;
  return codes.every((c) => hasPermission(user, c));
}

/** Vào thẳng Kiểm quầy (không cần ca hôm nay / GPS), xem ngày cũ — khớp BE RequireShiftCashAccess. Mặc định chỉ Admin. */
export function canOverseeShiftCash(user: AuthUser | null | undefined): boolean {
  return hasPermission(user, PERMISSIONS.shiftCash.oversightRead);
}

/** Ghi ngày cũ, sửa / xoá khoản thu chi của người khác. */
export function canManageShiftCashOversight(user: AuthUser | null | undefined): boolean {
  return hasPermission(user, PERMISSIONS.shiftCash.oversightManage);
}
