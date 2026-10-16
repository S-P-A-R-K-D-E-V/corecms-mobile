jest.mock('src/services/store-config', () => ({ isMultiStore: true }));

import { canUseAssistant } from '../roles';

// Bản cửa hàng: trợ lý cho chủ / quản lý, và vai trò tuỳ chỉnh được cấp báo cáo / tiền (core-be StoreAssistant chỉ đưa
// đúng tool theo quyền). Nhân viên thường không thấy.

const user = (roles: string[], permissions: string[] = []) => ({ role: roles[0], roles, permissions }) as any;

describe('canUseAssistant (bản cửa hàng)', () => {
  it('chủ cửa hàng và quản lý thấy trợ lý', () => {
    expect(canUseAssistant(user(['Admin']))).toBe(true);
    expect(canUseAssistant(user(['Manager']))).toBe(true);
  });

  it('nhân viên thường không thấy', () => {
    expect(canUseAssistant(user(['Staff']))).toBe(false);
    expect(canUseAssistant(user(['Staff'], ['cleaning.review', 'shift.request.review']))).toBe(false);
  });

  it('"Kế toán" gốc nhân viên được cấp báo cáo / lương thì thấy', () => {
    expect(canUseAssistant(user(['Staff'], ['analytics.revenue.read']))).toBe(true);
    expect(canUseAssistant(user(['Staff'], ['payroll.records.read']))).toBe(true);
  });
});
