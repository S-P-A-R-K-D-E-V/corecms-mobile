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
    /** Doanh thu ở Kiểm quầy + kiểm tra chênh lệch doanh thu — không có: số doanh thu hiện "****". */
    revenueRead: 'shift-cash.revenue.read',
  },
  /** Lương — lương của chính mình không cần quyền. Quyền ghi cần kèm quyền xem tương ứng (Core-be Requires). */
  payroll: {
    recordsRead: 'payroll.records.read',
    calculate: 'payroll.calculate',
    recalculate: 'payroll.recalculate',
    finalize: 'payroll.finalize',
    paymentPrepare: 'payroll.payment.prepare',
    markPaid: 'payroll.mark-paid',
    cycleManage: 'payroll.cycle.manage',
    cyclePublish: 'payroll.cycle.publish',
    cycleDelete: 'payroll.cycle.delete',
    penaltyManage: 'payroll.penalty.manage',
    policyManage: 'payroll.policy.manage',
    salaryConfigRead: 'payroll.salary-config.read',
    salaryConfigManage: 'payroll.salary-config.manage',
  },
  /** Chấm công — tự chấm công, việc của chính mình không cần quyền. */
  attendance: {
    read: 'attendance.read',
    adjust: 'attendance.adjust',
    requestProcess: 'attendance.request.process',
  },
  /** Vệ sinh — checklist của mình, chụp ảnh, đánh dấu xong không cần quyền. Chấm điểm / phạt cần kèm quyền xem. */
  cleaning: {
    read: 'cleaning.read',
    templateManage: 'cleaning.template.manage',
    review: 'cleaning.review',
    penaltyManage: 'cleaning.penalty.manage',
  },
  /** Ca làm — lịch của mình, đăng ký / nhường / đổi ca của mình không cần quyền. */
  shift: {
    templateManage: 'shift.template.manage',
    scheduleManage: 'shift.schedule.manage',
    assignmentRead: 'shift.assignment.read',
    assignmentManage: 'shift.assignment.manage',
    registrationManage: 'shift.registration.manage',
    requestReview: 'shift.request.review',
    /** Sửa ca đã chấm công / đã bắt đầu, duyệt muộn, huỷ yêu cầu sớm — mặc định chỉ Admin. */
    override: 'shift.override',
    auditRead: 'shift.audit.read',
    reminderManage: 'shift.reminder.manage',
  },
  /** Hàng hoá — xem hàng, nhóm hàng, đơn vị không cần quyền. Thêm / sửa cần kèm xem giá vốn. */
  products: {
    costRead: 'products.cost.read',
    create: 'products.create',
    update: 'products.update',
    delete: 'products.delete',
    catalogManage: 'products.catalog.manage',
  },
  /** Tồn kho — chỉnh tồn trực tiếp (kể cả đẩy lại sang KiotViet) mặc định chỉ Admin; lịch sử chỉnh tồn Admin, Manager. */
  inventory: {
    warehouseManage: 'inventory.warehouse.manage',
    adjustmentRead: 'inventory.adjustment.read',
    adjust: 'inventory.adjust',
  },
  /** Nhập hàng — thao tác cần kèm quyền xem. Trả nhà cung cấp từ quầy không cần quyền. */
  purchase: {
    read: 'purchase.read',
    create: 'purchase.create',
    update: 'purchase.update',
    confirm: 'purchase.confirm',
    receive: 'purchase.receive',
    cancel: 'purchase.cancel',
    paidBySet: 'purchase.paid-by.set',
    paymentManage: 'purchase.payment.manage',
  },
  supplier: { read: 'supplier.read', manage: 'supplier.manage' },
  /** Hoá đơn bán — bán theo giá niêm yết, xem hoá đơn mình bán hôm nay không cần quyền. Máy quầy xem mọi hoá đơn. */
  sales: {
    orderRead: 'sales.order.read',
    orderUpdate: 'sales.order.update',
    orderCancel: 'sales.order.cancel',
    paymentAdd: 'sales.order.payment.add',
    /** Bán khác giá niêm yết, giảm giá tay, chọn người bán. */
    priceOverride: 'sales.price.override',
  },
  salesReturn: { read: 'sales-return.read', create: 'sales-return.create', complete: 'sales-return.complete' },
  customer: { read: 'customer.read', manage: 'customer.manage' },
  /** Nhân viên — tài khoản Admin chỉ Admin đụng được, gán vai trò chỉ Admin (luật theo vai trò). */
  user: {
    read: 'user.read',
    update: 'user.update',
    status: 'user.status',
    passwordReset: 'user.password.reset',
    delete: 'user.delete',
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

/** Xem doanh thu + kiểm tra chênh lệch doanh thu ở Kiểm quầy (mặc định Chủ + Quản lý) — người giám sát cũng xem được. */
export function canViewShiftCashRevenue(user: AuthUser | null | undefined): boolean {
  return (
    hasPermission(user, PERMISSIONS.shiftCash.revenueRead) ||
    hasPermission(user, PERMISSIONS.shiftCash.oversightRead)
  );
}

/** Ghi ngày cũ, sửa / xoá khoản thu chi của người khác. */
export function canManageShiftCashOversight(user: AuthUser | null | undefined): boolean {
  return hasPermission(user, PERMISSIONS.shiftCash.oversightManage);
}

const SHIFT = PERMISSIONS.shift;
const ATTENDANCE = PERMISSIONS.attendance;

/** Quyền của từng màn trong stack "Quản lý" = quyền của API màn đó gọi (Core-be shift.* / attendance.* / cleaning.*). */
export const MANAGE_SCREEN_PERMISSIONS = {
  teamSchedule: [SHIFT.assignmentRead],
  assignShift: [SHIFT.assignmentRead, SHIFT.assignmentManage],
  coverShift: [SHIFT.assignmentRead, SHIFT.assignmentManage],
  /** Duyệt yêu cầu: có MỘT trong hai là vào được, mỗi tab theo quyền của nó. */
  approvals: [ATTENDANCE.requestProcess, SHIFT.requestReview, PERMISSIONS.user.update],
  /** Theo dõi tuần / chấm vệ sinh: xem checklist; nút chấm, phạt theo quyền riêng trong màn. */
  cleaningReview: [PERMISSIONS.cleaning.read],
  /** Thư viện đầu việc, xây checklist tuần. */
  cleaningTemplates: [PERMISSIONS.cleaning.templateManage],
} as const satisfies Record<string, readonly string[]>;
