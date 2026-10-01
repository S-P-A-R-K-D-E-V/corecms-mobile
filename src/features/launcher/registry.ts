import type { IconName } from 'src/components/ui';
import type { AuthUser } from 'src/auth/auth-context';
import { hasAnyRole, MANAGER_ROLES, ADMIN_ROLES } from 'src/auth/roles';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// Danh mục tiện ích cho feature-grid (kiểu lưới tiện ích MB Bank). Thêm tính
// năng mới = thêm 1 dòng ở đây; grid + màn tùy chỉnh tự nhận. Route chưa dựng
// đánh dấu `comingSoon` để hiển thị "Sắp có" thay vì điều hướng.
// ----------------------------------------------------------------------

export type LauncherGroup = 'personal' | 'manage' | 'admin';

/** Màu ô icon theo mảng việc (như icon nhiều màu của Minimal bản web) — không tô hết bằng màu chính. */
export type FeatureTone = 'primary' | 'info' | 'success' | 'warning' | 'secondary';

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
};

const GROUP_KEYS: Record<LauncherGroup, string> = {
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
  // ── Cá nhân (mọi nhân viên) ────────────────────────────────────────
  { key: 'checkin', label: 'Điểm danh', icon: 'fingerprint', href: '/(tabs)/checkin', tone: 'primary', group: 'personal' },
  { key: 'schedule', label: 'Lịch làm', icon: 'calendar-month', href: '/(tabs)/schedule', tone: 'info', group: 'personal' },
  { key: 'payroll', label: 'Lương', icon: 'cash-multiple', href: '/(tabs)/payroll', tone: 'success', group: 'personal' },
  { key: 'shift-register', label: 'Đăng ký ca', icon: 'calendar-plus', href: '/shift-register', tone: 'info', group: 'personal' },
  { key: 'shift-swap', label: 'Đổi ca', icon: 'swap-horizontal', href: '/shift-swap', tone: 'secondary', group: 'personal' },
  { key: 'shift-pool', label: 'Nhận ca', icon: 'hand-heart', href: '/shift-pool', tone: 'secondary', group: 'personal' },
  { key: 'shift-cash', label: 'Kiểm quầy', icon: 'cash-register', href: '/shift-cash', tone: 'success', group: 'personal' },
  // Bảng công đang làm lại — tạm đánh dấu "Sắp có" để không điều hướng vào màn dở dang.
  { key: 'attendance', label: 'Bảng công', icon: 'clipboard-text-clock', href: '/attendance', tone: 'primary', group: 'personal', comingSoon: true },
  { key: 'notifications', label: 'Thông báo', icon: 'bell-outline', href: '/notifications', tone: 'warning', group: 'personal' },

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
  admin: ['team-schedule', 'approvals', 'assign-shift', 'cover-shift', 'cleaning-week', 'cleaning-builder', 'revenue-report', 'financial-overview', 'break-even-report', 'attendance-report', 'payroll-cycle', 'users'],
};
