import type { IconName } from 'src/components/ui';
import type { AuthUser } from 'src/auth/auth-context';
import { hasAnyRole, MANAGER_ROLES, ADMIN_ROLES, SHIFT_CASH_ROLES, canUseAssistant, assistantEnabled } from 'src/auth/roles';
import type { BranchType } from 'src/features/branch/working-branch';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// Danh mục tiện ích cho feature-grid (kiểu lưới tiện ích MB Bank). Thêm tính
// năng mới = thêm 1 dòng ở đây; grid + màn tùy chỉnh tự nhận. Route chưa dựng
// đánh dấu `comingSoon` để hiển thị "Sắp có" thay vì điều hướng.
// ----------------------------------------------------------------------

export type LauncherGroup = 'sales' | 'personal' | 'manage' | 'admin';

/** Số tiện ích ghim tối đa ở "Dùng nhanh" trang chủ (2 hàng × 4, như MB Bank). */
export const MAX_PINS = 8;

/** Màu ô icon theo mảng việc (như icon nhiều màu của Minimal bản web) — không tô hết bằng màu chính. */
export type FeatureTone = 'primary' | 'info' | 'success' | 'warning' | 'secondary';

/** Ngữ cảnh ngoài vai trò để quyết định hiện một tiện ích. */
export type FeatureContext = {
  /** Loại hình của chi nhánh máy đang làm việc; null = chưa chọn chi nhánh / chưa biết. */
  branchType: BranchType | null;
  /** Tính năng cửa hàng đang bật (GET /users/me → enabledFeatures); null = chưa biết. */
  enabledFeatures: readonly string[] | null;
};

/** Ngữ cảnh của người dùng này; không truyền loại hình chi nhánh = chưa biết. */
export function featureContext(user: AuthUser | null | undefined, branchType: BranchType | null = null): FeatureContext {
  return { branchType, enabledFeatures: user?.enabledFeatures ?? null };
}

/**
 * Cửa hàng CÓ bật tính năng `key`. Chưa biết danh sách thì coi như CHƯA bật — ngược với trợ lý AI
 * (assistantEnabled): tính năng đang phát triển phải ẩn khi thiếu thông tin.
 */
export function hasStoreFeature(ctx: FeatureContext, key: string): boolean {
  return !!ctx.enabledFeatures && ctx.enabledFeatures.includes(key);
}

/** Khoá tính năng bán hàng F&B của gói cửa hàng. */
export const FNB_POS_FEATURE = 'commerce.fnb.pos';

/**
 * Điều kiện hiện tiện ích F&B: cửa hàng có khoá tính năng VÀ chi nhánh đang làm việc là F&B. Thiếu một trong hai
 * (hoặc chưa biết) thì ẩn — F&B không được lộ ra ngoài khi chưa bật.
 */
export function fnbVisible(ctx: FeatureContext, featureKey: string = FNB_POS_FEATURE): boolean {
  return ctx.branchType === 'fnb' && hasStoreFeature(ctx, featureKey);
}

export type FeatureItem = {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  group: LauncherGroup;
  /** Mặc định primary. */
  tone?: FeatureTone;
  /** Vai trò yêu cầu để THẤY tiện ích (rỗng = mọi nhân viên nội bộ). */
  roles?: readonly string[];
  /** Route chưa triển khai — hiển thị mờ + nhãn "Sắp có". */
  comingSoon?: boolean;
  /**
   * Điều kiện hiển thị ngoài vai trò (vd trợ lý AI tuỳ cửa hàng bật). `ctx`: loại hình chi nhánh đang làm việc +
   * tính năng cửa hàng bật — tiện ích theo loại hình (F&B) dùng fnbVisible(ctx).
   */
  visible?: (user: AuthUser | null | undefined, ctx: FeatureContext) => boolean;
};

const GROUP_KEYS: Record<LauncherGroup, string> = {
  sales: 'launcher.groupSales',
  personal: 'launcher.groupPersonal',
  manage: 'launcher.groupManage',
  admin: 'launcher.groupAdmin',
};

/** Tên nhóm theo ngôn ngữ đang dùng. */
export function groupLabel(group: LauncherGroup): string {
  return t(GROUP_KEYS[group]);
}

/** Tên tiện ích theo ngôn ngữ đang dùng (khoá features.<key>; thiếu thì dùng `label` tiếng Việt). */
export function featureLabel(item: FeatureItem): string {
  const translated = t(`features.${item.key}`);
  return translated === `features.${item.key}` ? item.label : translated;
}

export const FEATURE_REGISTRY: FeatureItem[] = [
  // ── Bán hàng (ERP trên app — KiotViet vẫn là hệ thống chính, đơn app đồng bộ sang) ──
  // Nhân viên bán được; Hoá đơn (cả cửa hàng) cho quản lý trở lên.
  { key: 'pos', label: 'Bán hàng', icon: 'cart-outline', href: '/(tabs)/pos', tone: 'primary', group: 'sales' },
  { key: 'products', label: 'Hàng hoá', icon: 'package-variant-closed', href: '/(tabs)/products', tone: 'info', group: 'sales' },
  { key: 'invoices', label: 'Hoá đơn', icon: 'receipt', href: '/(tabs)/invoices', tone: 'success', group: 'sales', roles: MANAGER_ROLES },
  { key: 'purchase-orders', label: 'Nhập hàng', icon: 'truck-delivery-outline', href: '/purchase-orders', tone: 'warning', group: 'sales', roles: MANAGER_ROLES },

  // ── Cá nhân (mọi nhân viên) ────────────────────────────────────────
  { key: 'checkin', label: 'Điểm danh', icon: 'fingerprint', href: '/(tabs)/checkin', tone: 'primary', group: 'personal' },
  { key: 'schedule', label: 'Lịch làm', icon: 'calendar-month', href: '/(tabs)/schedule', tone: 'info', group: 'personal' },
  { key: 'payroll', label: 'Lương', icon: 'cash-multiple', href: '/(tabs)/payroll', tone: 'success', group: 'personal' },
  { key: 'shift-register', label: 'Đăng ký ca', icon: 'calendar-plus', href: '/shift-register', tone: 'info', group: 'personal' },
  { key: 'shift-swap', label: 'Đổi ca', icon: 'swap-horizontal', href: '/shift-swap', tone: 'secondary', group: 'personal' },
  { key: 'shift-pool', label: 'Nhận ca', icon: 'hand-heart', href: '/shift-pool', tone: 'secondary', group: 'personal' },
  // Kiểm quầy: ô hiện cho mọi nhân viên nội bộ; vào được hay không do cổng trong màn quyết định — Admin vào
  // thẳng, Staff/Manager phải có ca hôm nay + đang ở cửa hàng (BE chặn cùng luật).
  { key: 'shift-cash', label: 'Kiểm quầy', icon: 'cash-register', href: '/shift-cash', tone: 'success', group: 'personal', roles: SHIFT_CASH_ROLES },
  // Bảng công đang làm lại — tạm đánh dấu "Sắp có" để không điều hướng vào màn dở dang.
  { key: 'attendance', label: 'Bảng công', icon: 'clipboard-text-clock', href: '/attendance', tone: 'primary', group: 'personal', comingSoon: true },
  { key: 'notifications', label: 'Thông báo', icon: 'bell-outline', href: '/notifications', tone: 'warning', group: 'personal' },
  { key: 'chat', label: 'Tin nhắn', icon: 'chat-outline', href: '/(tabs)/chat', tone: 'info', group: 'personal' },
  {
    key: 'assistant', label: 'Trợ lý AI', icon: 'robot-happy-outline', href: '/(tabs)/assistant', tone: 'secondary', group: 'personal',
    visible: (u) => canUseAssistant(u) && assistantEnabled(u),
  },

  // ── Quản lý (Manager/Admin) ────────────────────────────────────────
  { key: 'team-schedule', label: 'Lịch đội ngũ', icon: 'calendar-account', href: '/manage/schedule', tone: 'info', group: 'manage', roles: MANAGER_ROLES },
  { key: 'approvals', label: 'Duyệt yêu cầu', icon: 'check-decagram', href: '/manage/approvals', tone: 'warning', group: 'manage', roles: MANAGER_ROLES },
  { key: 'assign-shift', label: 'Xếp ca', icon: 'calendar-edit', href: '/manage/assign', tone: 'info', group: 'manage', roles: MANAGER_ROLES },
  { key: 'cover-shift', label: 'Đổi ca hộ', icon: 'account-switch', href: '/manage/cover', tone: 'secondary', group: 'manage', roles: MANAGER_ROLES },
  { key: 'cleaning-week', label: 'Theo dõi vệ sinh', icon: 'broom', href: '/manage/cleaning', tone: 'warning', group: 'manage', roles: MANAGER_ROLES },
  { key: 'cleaning-review', label: 'Đánh giá vệ sinh', icon: 'clipboard-check-outline', href: '/manage/cleaning-review', tone: 'warning', group: 'manage', roles: MANAGER_ROLES },

  // ── Quản trị (Admin) ───────────────────────────────────────────────
  { key: 'dashboard', label: 'Dashboard', icon: 'view-dashboard', href: '/(tabs)/admin', tone: 'primary', group: 'admin', roles: ADMIN_ROLES },
  { key: 'revenue-report', label: 'Doanh thu', icon: 'chart-line', href: '/admin/revenue', tone: 'success', group: 'admin', roles: ADMIN_ROLES },
  { key: 'financial-overview', label: 'Tổng quan tài chính', icon: 'finance', href: '/admin/financial-overview', tone: 'success', group: 'admin', roles: ADMIN_ROLES },
  { key: 'break-even-report', label: 'Điểm hòa vốn', icon: 'target', href: '/admin/break-even', tone: 'info', group: 'admin', roles: ADMIN_ROLES },
  { key: 'attendance-report', label: 'Báo cáo công', icon: 'chart-box', href: '/admin/attendance-report', tone: 'primary', group: 'admin', roles: ADMIN_ROLES },
  { key: 'payroll-cycle', label: 'Chu kỳ lương', icon: 'cash-sync', href: '/admin/payroll', tone: 'success', group: 'admin', roles: ADMIN_ROLES },
  { key: 'users', label: 'Người dùng', icon: 'account-group', href: '/admin/users', tone: 'secondary', group: 'admin', roles: ADMIN_ROLES },
  { key: 'cleaning-tasks', label: 'Thư viện đầu việc', icon: 'clipboard-list-outline', href: '/manage/cleaning-tasks', tone: 'warning', group: 'admin', roles: ADMIN_ROLES },
  { key: 'cleaning-builder', label: 'Xây dựng checklist', icon: 'calendar-edit', href: '/manage/cleaning-builder', tone: 'warning', group: 'admin', roles: ADMIN_ROLES },
];

const BY_KEY = new Map(FEATURE_REGISTRY.map((f) => [f.key, f]));

export function getFeature(key: string): FeatureItem | undefined {
  return BY_KEY.get(key);
}

/** Tiện ích này có hiện với người dùng + ngữ cảnh này không (vai trò và điều kiện `visible`). */
export function isFeatureVisible(item: FeatureItem, user: AuthUser | null | undefined, ctx: FeatureContext = featureContext(user)): boolean {
  return hasAnyRole(user, item.roles) && (item.visible?.(user, ctx) ?? true);
}

/**
 * Các tiện ích user ĐƯỢC PHÉP thấy (lọc theo vai trò + ngữ cảnh). Không truyền `ctx` = chưa biết chi nhánh
 * (tiện ích theo loại hình sẽ ẩn) — màn hình lấy ctx bằng useFeatureContext().
 */
export function availableFeatures(user: AuthUser | null | undefined, ctx: FeatureContext = featureContext(user)): FeatureItem[] {
  return FEATURE_REGISTRY.filter((f) => isFeatureVisible(f, user, ctx));
}

/** Ghim đang hiện: chỉ mục user được thấy, giữ thứ tự ghim, tối đa MAX_PINS. */
export function visiblePins(keys: string[], user: AuthUser | null | undefined, ctx: FeatureContext = featureContext(user)): FeatureItem[] {
  const allowed = new Set(availableFeatures(user, ctx).map((f) => f.key));
  return keys
    .filter((k) => allowed.has(k))
    .map((k) => getFeature(k))
    .filter((f): f is FeatureItem => !!f)
    .slice(0, MAX_PINS);
}

// Biến thể lưới theo shell điều hướng (cùng là "Dùng nhanh" ở trang chủ): 'staff' = shell nhân viên,
// 'admin' = shell chủ cửa hàng.
export type LauncherVariant = 'staff' | 'admin';

/**
 * Ghim mặc định khi user chưa tùy chỉnh — chọn theo shell để hữu ích ngay. Danh sách dài hơn MAX_PINS
 * có chủ đích: mục user không được thấy (lọc role) tự rơi ra, phần còn lại lấy 8 mục đầu — Staff thuần
 * thấy bán hàng + ca, Manager/Admin-kiêm-ca thấy thêm việc quản lý.
 */
export const DEFAULT_PINS: Record<LauncherVariant, string[]> = {
  staff: ['pos', 'products', 'shift-register', 'shift-swap', 'team-schedule', 'approvals', 'shift-cash', 'shift-pool', 'notifications', 'assign-shift', 'cleaning-week'],
  admin: ['purchase-orders', 'revenue-report', 'break-even-report', 'team-schedule', 'approvals', 'payroll-cycle', 'attendance-report', 'users'],
};
