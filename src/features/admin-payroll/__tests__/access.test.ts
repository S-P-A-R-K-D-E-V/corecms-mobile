import { payrollAccessFor } from '../access';
import { isFeatureVisible, getFeature } from 'src/features/launcher/registry';

// Màn quản lý lương theo quyền payroll.* (khớp Core-be / core-fe): Admin đủ hết; Manager như API (không chốt, không
// xác nhận đã chi, không tạo / tính lại bảng lương hàng loạt, không công bố kỳ); vai trò tuỳ chỉnh theo quyền được cấp.

const MANAGER_DEFAULTS = [
  'payroll.records.read',
  'payroll.calculate',
  'payroll.payment.prepare',
  'payroll.cycle.manage',
  'payroll.penalty.manage',
  'payroll.policy.manage',
  'payroll.salary-config.read',
  'payroll.salary-config.manage',
];

const user = (u: Record<string, unknown>) => ({ permissions: [], ...u }) as any;

describe('payrollAccessFor', () => {
  it('Admin làm được mọi thứ', () => {
    expect(Object.values(payrollAccessFor(user({ role: 'Admin', roles: ['Admin'] }))).every(Boolean)).toBe(true);
  });

  it('Manager (quyền mặc định) như API', () => {
    expect(payrollAccessFor(user({ role: 'Manager', roles: ['Manager'], permissions: MANAGER_DEFAULTS }))).toEqual({
      canReadRecords: true,
      canCreateCycle: false,
      canRecalculate: false,
      canFinalize: false,
      canPreparePayment: true,
      canMarkPaid: false,
      canPublishCycle: false,
      canManagePenalty: true,
      canManageSalaryConfig: true,
    });
  });

  it('thiếu quyền xem thì không ghi được', () => {
    expect(payrollAccessFor(user({ role: 'Staff', permissions: ['payroll.finalize'] })).canFinalize).toBe(false);
  });
});

describe('tiện ích "Chu kỳ lương"', () => {
  const tile = getFeature('payroll-cycle')!;

  it('hiện theo quyền xem bảng lương thay vì chỉ Admin', () => {
    expect(isFeatureVisible(tile, user({ role: 'Admin', roles: ['Admin'] }))).toBe(true);
    expect(isFeatureVisible(tile, user({ role: 'Manager', roles: ['Manager'], permissions: MANAGER_DEFAULTS }))).toBe(true);
    expect(isFeatureVisible(tile, user({ role: 'Staff', roles: ['Staff'], permissions: ['payroll.records.read'] }))).toBe(true);
    expect(isFeatureVisible(tile, user({ role: 'Staff', roles: ['Staff'] }))).toBe(false);
  });
});
