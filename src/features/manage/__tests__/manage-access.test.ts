import { MANAGE_SCREEN_PERMISSIONS, hasAllPermissions, hasAnyPermission } from 'src/auth/permissions';
import { getFeature, isFeatureVisible } from 'src/features/launcher/registry';

// Khu "Quản lý" (ca làm / chấm công) theo quyền shift.* / attendance.* thay vì vai trò Manager / Admin: Manager có quyền
// mặc định nên như cũ; vai trò tuỳ chỉnh (vd Trưởng ca) thấy đúng tiện ích được cấp; vệ sinh vẫn theo vai trò.

const MANAGER_DEFAULTS = [
  'shift.assignment.read',
  'shift.assignment.manage',
  'shift.request.review',
  'attendance.read',
  'attendance.request.process',
];

const user = (u: Record<string, unknown>) => ({ permissions: [], ...u }) as any;
const visible = (key: string, u: any) => isFeatureVisible(getFeature(key)!, u);

describe('tiện ích khu Quản lý theo quyền', () => {
  it('Manager (quyền mặc định) và Admin thấy đủ', () => {
    const manager = user({ role: 'Manager', roles: ['Manager'], permissions: MANAGER_DEFAULTS });
    const admin = user({ role: 'Admin', roles: ['Admin'] });
    ['team-schedule', 'approvals', 'assign-shift', 'cover-shift'].forEach((key) => {
      expect(visible(key, manager)).toBe(true);
      expect(visible(key, admin)).toBe(true);
    });
  });

  it('nhân viên thường không thấy; Trưởng ca chỉ duyệt đổi ca thấy "Duyệt yêu cầu", không thấy "Xếp ca"', () => {
    const staff = user({ role: 'Staff', roles: ['Staff'] });
    expect(visible('approvals', staff)).toBe(false);
    expect(visible('team-schedule', staff)).toBe(false);

    const lead = user({ role: 'Staff', roles: ['Staff'], permissions: ['shift.request.review'] });
    expect(visible('approvals', lead)).toBe(true);
    expect(visible('assign-shift', lead)).toBe(false);
  });

  it('vệ sinh vẫn theo vai trò Manager / Admin', () => {
    expect(visible('cleaning-week', user({ role: 'Staff', roles: ['Staff'], permissions: MANAGER_DEFAULTS }))).toBe(false);
    expect(visible('cleaning-week', user({ role: 'Manager', roles: ['Manager'] }))).toBe(true);
  });

  it('quyền màn hình: xếp ca cần cả xem lẫn xếp; duyệt cần MỘT trong hai', () => {
    const readOnly = user({ role: 'Staff', permissions: ['shift.assignment.read'] });
    expect(hasAllPermissions(readOnly, MANAGE_SCREEN_PERMISSIONS.teamSchedule)).toBe(true);
    expect(hasAllPermissions(readOnly, MANAGE_SCREEN_PERMISSIONS.assignShift)).toBe(false);
    expect(hasAnyPermission(user({ role: 'Staff', permissions: ['attendance.request.process'] }), MANAGE_SCREEN_PERMISSIONS.approvals)).toBe(true);
  });
});

describe('Báo cáo công trong stack Quản trị', () => {
  it('theo attendance.read thay vì chỉ Admin', () => {
    expect(visible('attendance-report', user({ role: 'Manager', roles: ['Manager'], permissions: MANAGER_DEFAULTS }))).toBe(true);
    expect(visible('attendance-report', user({ role: 'Staff', roles: ['Staff'] }))).toBe(false);
  });
});
