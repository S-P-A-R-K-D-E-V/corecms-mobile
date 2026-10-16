import {
  PERMISSIONS,
  REPORT_SCREEN_PERMISSIONS,
  ANY_REPORT_PERMISSION,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  canOverseeShiftCash,
  canManageShiftCashOversight,
} from '../permissions';

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

const user = (u: Record<string, unknown>) => ({ permissions: [], ...u }) as any;

// Kiểm quầy: "vào thẳng / xem ngày cũ" trước đây cứng là Admin — giờ theo quyền giám sát (mặc định chỉ Admin, khớp BE).
describe('giám sát Kiểm quầy', () => {
  it('mặc định chỉ Admin; Manager theo luật của Staff', () => {
    expect(canOverseeShiftCash(user({ role: 'Admin', roles: ['Admin'] }))).toBe(true);
    expect(canManageShiftCashOversight(user({ role: 'Admin', roles: ['Admin'] }))).toBe(true);
    expect(canOverseeShiftCash(user({ role: 'Manager', roles: ['Manager'] }))).toBe(false);
    expect(canOverseeShiftCash(null)).toBe(false);
  });

  it('vai trò tuỳ chỉnh được cấp quyền xem / sửa giám sát', () => {
    const viewer = user({ role: 'Staff', roles: ['Staff'], permissions: [PERMISSIONS.shiftCash.oversightRead] });
    expect(canOverseeShiftCash(viewer)).toBe(true);
    expect(canManageShiftCashOversight(viewer)).toBe(false);
    expect(
      canManageShiftCashOversight(
        user({
          role: 'Staff',
          roles: ['Staff'],
          permissions: [PERMISSIONS.shiftCash.oversightRead, PERMISSIONS.shiftCash.oversightManage],
        })
      )
    ).toBe(true);
  });
});
