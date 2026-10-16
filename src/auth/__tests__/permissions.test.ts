import { PERMISSIONS, REPORT_SCREEN_PERMISSIONS, ANY_REPORT_PERMISSION, hasPermission, hasAllPermissions, hasAnyPermission } from '../permissions';

// Quyền hiệu lực lấy từ GET /users/me → permissions; Admin có mọi quyền như API ("*").

const A = PERMISSIONS.analytics;
const owner = { role: 'Staff', roles: ['Staff', 'Admin'], permissions: [] } as any;
const accountant = { role: 'Staff', roles: ['Staff'], permissions: [A.revenue, A.paymentMethod] } as any;
const staff = { role: 'Staff', roles: ['Staff'], permissions: [] } as any;

describe('permissions', () => {
  it('Admin có mọi quyền', () => {
    expect(hasPermission(owner, A.export)).toBe(true);
    expect(hasAllPermissions(owner, REPORT_SCREEN_PERMISSIONS.financialOverview)).toBe(true);
  });

  it('người khác: đúng quyền được cấp', () => {
    expect(hasAllPermissions(accountant, REPORT_SCREEN_PERMISSIONS.revenue)).toBe(true);
    expect(hasAllPermissions(accountant, REPORT_SCREEN_PERMISSIONS.financialOverview)).toBe(false);
    expect(hasAnyPermission(accountant, ANY_REPORT_PERMISSION)).toBe(true);
    expect(hasAnyPermission(staff, ANY_REPORT_PERMISSION)).toBe(false);
    expect(hasPermission(null, A.revenue)).toBe(false);
  });

  it('không khai báo quyền = không giới hạn', () => {
    expect(hasAnyPermission(staff, undefined)).toBe(true);
    expect(hasAllPermissions(staff, [])).toBe(true);
  });

  it('màn báo cáo đòi đủ quyền của các API nó gọi; mã trùng Core-be', () => {
    expect(REPORT_SCREEN_PERMISSIONS.revenue).toEqual(['analytics.revenue.read', 'analytics.payment-method.read']);
    expect(ANY_REPORT_PERMISSION).not.toContain(A.export);
  });
});
