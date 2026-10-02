import type { AuthUser } from 'src/auth/auth-context';
import { ADMIN_ROLES, INTERNAL_APP_ROLES, MANAGER_ROLES, hasAnyRole } from 'src/auth/roles';
import { getFeature } from 'src/features/launcher/registry';

// ----------------------------------------------------------------------
// Danh mục màn mà nút "mở màn" (action navigate) của trợ lý được phép mở — bản sao của
// AssistantRouteCatalog phía core-be (contract ASSISTANT CHAT v1 §4). Khoá trùng khoá lưới tiện ích
// (features/launcher/registry). Server đã lọc theo vai trò người hỏi; app kiểm lại:
//   - vai trò của route + vai trò / visible() / comingSoon của tiện ích tương ứng (bản cửa hàng thiếu
//     tiện ích nào thì nút tự ẩn);
//   - tham số đúng khai báo, giá trị chỉ [A-Za-z0-9_-]{1,64}.
// Không khớp → null → không hiện nút. Không bao giờ mở đường dẫn tự do do model viết.
// ----------------------------------------------------------------------

export type RouteParamDef = { name: string; in: 'path' | 'query' };

export type AssistantRouteDef = {
  pathname: string;
  params?: RouteParamDef[];
  roles: readonly string[];
  /** Khoá tiện ích (registry) để kiểm visible/comingSoon — mặc định chính khoá route. */
  feature?: string;
};

const ALL = INTERNAL_APP_ROLES;
const MANAGER = MANAGER_ROLES;
const ADMIN = ADMIN_ROLES;
const id: RouteParamDef[] = [{ name: 'id', in: 'path' }];

export const ASSISTANT_ROUTES: Readonly<Record<string, AssistantRouteDef>> = {
  // Mọi nhân viên nội bộ (Staff/Manager/Admin)
  schedule: { pathname: '/(tabs)/schedule', roles: ALL },
  payroll: { pathname: '/(tabs)/payroll', roles: ALL },
  'payroll-detail': { pathname: '/(tabs)/payroll/[id]', params: id, roles: ALL, feature: 'payroll' },
  'shift-register': { pathname: '/shift-register', roles: ALL },
  'shift-swap': { pathname: '/shift-swap', roles: ALL },
  'shift-pool': { pathname: '/shift-pool', roles: ALL },
  checkin: { pathname: '/(tabs)/checkin', roles: ALL },
  notifications: { pathname: '/notifications', roles: ALL },
  chat: { pathname: '/(tabs)/chat', roles: ALL },
  products: { pathname: '/(tabs)/products', roles: ALL },
  'product-detail': { pathname: '/products/[id]', params: id, roles: ALL, feature: 'products' },
  pos: { pathname: '/(tabs)/pos', roles: ALL },

  // Quản lý + Admin
  'team-schedule': { pathname: '/manage/schedule', roles: MANAGER },
  approvals: { pathname: '/manage/approvals', roles: MANAGER },
  'assign-shift': { pathname: '/manage/assign', roles: MANAGER },
  'cover-shift': { pathname: '/manage/cover', roles: MANAGER },
  invoices: { pathname: '/(tabs)/invoices', roles: MANAGER },
  'invoice-detail': { pathname: '/invoices/[id]', params: id, roles: MANAGER, feature: 'invoices' },
  'purchase-orders': { pathname: '/purchase-orders', roles: MANAGER },
  'purchase-order-detail': { pathname: '/purchase-orders/[id]', params: id, roles: MANAGER, feature: 'purchase-orders' },

  // Admin
  dashboard: { pathname: '/(tabs)/admin', roles: ADMIN },
  'revenue-report': { pathname: '/admin/revenue', roles: ADMIN },
  'financial-overview': { pathname: '/admin/financial-overview', roles: ADMIN },
  'break-even-report': { pathname: '/admin/break-even', roles: ADMIN },
  'attendance-report': { pathname: '/admin/attendance-report', roles: ADMIN },
  'payroll-cycle': { pathname: '/admin/payroll', roles: ADMIN },
  'payroll-cycle-detail': {
    pathname: '/admin/payroll-detail',
    params: [{ name: 'cycleId', in: 'query' }],
    roles: ADMIN,
    feature: 'payroll-cycle',
  },
  'payroll-record': {
    pathname: '/admin/payroll-record',
    params: [{ name: 'recordId', in: 'query' }],
    roles: ADMIN,
    feature: 'payroll-cycle',
  },
  users: { pathname: '/admin/users', roles: ADMIN },
  'user-detail': { pathname: '/admin/user-detail', params: [{ name: 'userId', in: 'query' }], roles: ADMIN, feature: 'users' },
};

const PARAM_VALUE = /^[A-Za-z0-9_-]{1,64}$/;

/** Khoá route + tham số → href cho expo-router nếu người dùng này mở được; không thì null. */
export function resolveRoute(
  key: unknown,
  params: unknown,
  user: AuthUser | null | undefined
): string | null {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(ASSISTANT_ROUTES, key)) return null;
  const def = ASSISTANT_ROUTES[key]!;
  if (!hasAnyRole(user, def.roles)) return null;

  const feature = getFeature(def.feature ?? key);
  if (feature) {
    if (feature.comingSoon || !hasAnyRole(user, feature.roles)) return null;
    if (feature.visible && !feature.visible(user)) return null;
  }

  if (params != null && (typeof params !== 'object' || Array.isArray(params))) return null;
  const given = (params ?? {}) as Record<string, unknown>;
  const declared = def.params ?? [];
  // Tham số lạ → không mở (khớp server: chỉ tham số đã khai báo).
  if (Object.keys(given).some((k) => !declared.some((p) => p.name === k))) return null;

  let path = def.pathname;
  const query: string[] = [];
  for (const p of declared) {
    const value = given[p.name];
    if (typeof value !== 'string' || !PARAM_VALUE.test(value)) return null;
    if (p.in === 'path') path = path.replace(`[${p.name}]`, value);
    else query.push(`${p.name}=${encodeURIComponent(value)}`);
  }
  return query.length ? `${path}?${query.join('&')}` : path;
}
