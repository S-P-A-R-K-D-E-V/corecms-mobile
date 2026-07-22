import type { IconName } from 'src/components/ui';
import type { AuthUser } from 'src/auth/auth-context';
import { hasAnyRole, MANAGER_ROLES, ADMIN_ROLES } from 'src/auth/roles';

// ----------------------------------------------------------------------
// Danh mục tiện ích cho feature-grid (kiểu lưới tiện ích MB Bank). Thêm tính
// năng mới = thêm 1 dòng ở đây; grid + màn tùy chỉnh tự nhận. Route chưa dựng
// đánh dấu `comingSoon` để hiển thị "Sắp có" thay vì điều hướng.
// ----------------------------------------------------------------------

export type LauncherGroup = 'personal' | 'manage' | 'admin';

export type FeatureItem = {
  key: string;
  label: string;
  icon: IconName;
  href: string;
  group: LauncherGroup;
  /** Vai trò yêu cầu để THẤY tiện ích (rỗng = mọi nhân viên nội bộ). */
  roles?: readonly string[];
  /** Route chưa triển khai — hiển thị mờ + nhãn "Sắp có". */
  comingSoon?: boolean;
};

export const GROUP_LABELS: Record<LauncherGroup, string> = {
  personal: 'Cá nhân',
  manage: 'Quản lý',
  admin: 'Quản trị',
};

export const FEATURE_REGISTRY: FeatureItem[] = [
  // ── Cá nhân (mọi nhân viên) ────────────────────────────────────────
  { key: 'checkin', label: 'Điểm danh', icon: 'fingerprint', href: '/(tabs)/checkin', group: 'personal' },
  { key: 'schedule', label: 'Lịch làm', icon: 'calendar-month', href: '/(tabs)/schedule', group: 'personal' },
  { key: 'payroll', label: 'Lương', icon: 'cash-multiple', href: '/(tabs)/payroll', group: 'personal' },
  { key: 'shift-register', label: 'Đăng ký ca', icon: 'calendar-plus', href: '/shift-register', group: 'personal' },
  { key: 'shift-swap', label: 'Đổi ca', icon: 'swap-horizontal', href: '/shift-swap', group: 'personal' },
  { key: 'shift-pool', label: 'Nhận ca', icon: 'hand-heart', href: '/shift-pool', group: 'personal' },
  { key: 'shift-cash', label: 'Kiểm quầy', icon: 'cash-register', href: '/shift-cash', group: 'personal' },
  // Bảng công đang làm lại — tạm đánh dấu "Sắp có" để không điều hướng vào màn dở dang.
  { key: 'attendance', label: 'Bảng công', icon: 'clipboard-text-clock', href: '/attendance', group: 'personal', comingSoon: true },
  { key: 'notifications', label: 'Thông báo', icon: 'bell-outline', href: '/notifications', group: 'personal' },

  // ── Quản lý (Manager/Admin) ────────────────────────────────────────
  { key: 'team-schedule', label: 'Lịch đội ngũ', icon: 'calendar-account', href: '/manage/schedule', group: 'manage', roles: MANAGER_ROLES },
  { key: 'approvals', label: 'Duyệt yêu cầu', icon: 'check-decagram', href: '/manage/approvals', group: 'manage', roles: MANAGER_ROLES },
  { key: 'assign-shift', label: 'Xếp ca', icon: 'calendar-edit', href: '/manage/assign', group: 'manage', roles: MANAGER_ROLES },
  { key: 'cover-shift', label: 'Đổi ca hộ', icon: 'account-switch', href: '/manage/cover', group: 'manage', roles: MANAGER_ROLES },
  { key: 'cleaning-week', label: 'Theo dõi vệ sinh', icon: 'broom', href: '/manage/cleaning', group: 'manage', roles: MANAGER_ROLES },

  // ── Quản trị (Admin) ───────────────────────────────────────────────
  { key: 'dashboard', label: 'Dashboard', icon: 'view-dashboard', href: '/(tabs)/admin', group: 'admin', roles: ADMIN_ROLES },
  { key: 'revenue-report', label: 'Doanh thu', icon: 'chart-line', href: '/admin/revenue', group: 'admin', roles: ADMIN_ROLES },
  { key: 'financial-overview', label: 'Tổng quan tài chính', icon: 'finance', href: '/admin/financial-overview', group: 'admin', roles: ADMIN_ROLES },
  { key: 'break-even-report', label: 'Điểm hòa vốn', icon: 'target', href: '/admin/break-even', group: 'admin', roles: ADMIN_ROLES },
  { key: 'attendance-report', label: 'Báo cáo công', icon: 'chart-box', href: '/admin/attendance-report', group: 'admin', roles: ADMIN_ROLES },
  { key: 'payroll-cycle', label: 'Chu kỳ lương', icon: 'cash-sync', href: '/admin/payroll', group: 'admin', roles: ADMIN_ROLES },
  { key: 'users', label: 'Người dùng', icon: 'account-group', href: '/admin/users', group: 'admin', roles: ADMIN_ROLES },
];

const BY_KEY = new Map(FEATURE_REGISTRY.map((f) => [f.key, f]));

export function getFeature(key: string): FeatureItem | undefined {
  return BY_KEY.get(key);
}

/** Các tiện ích user ĐƯỢC PHÉP thấy (lọc theo vai trò). */
export function availableFeatures(user: AuthUser | null | undefined): FeatureItem[] {
  return FEATURE_REGISTRY.filter((f) => hasAnyRole(user, f.roles));
}

// Biến thể lưới theo shell điều hướng. 'staff' = màn Điểm danh, 'admin' = Dashboard.
export type LauncherVariant = 'staff' | 'admin';

/**
 * Ghim mặc định khi user chưa tùy chỉnh — chọn theo shell để hữu ích ngay.
 * Key nhóm quản lý vẫn nằm trong default của shell staff: Staff thuần bị lọc
 * role tự ẩn, còn Manager/Admin-kiêm-ca thấy ngay không cần tùy chỉnh.
 */
export const DEFAULT_PINS: Record<LauncherVariant, string[]> = {
  staff: ['team-schedule', 'approvals', 'assign-shift', 'cover-shift', 'cleaning-week', 'shift-cash', 'shift-register', 'shift-swap', 'shift-pool', 'attendance', 'notifications'],
  admin: ['team-schedule', 'approvals', 'assign-shift', 'cover-shift', 'cleaning-week', 'revenue-report', 'financial-overview', 'break-even-report', 'attendance-report', 'payroll-cycle', 'users'],
};
