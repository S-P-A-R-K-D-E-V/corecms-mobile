// Máy quầy chỉ phục vụ bán hàng: route ngoài phạm vi bị đưa về Bán hàng, lưới tiện ích chỉ còn mục của quầy.

import { isCounterPathAllowed } from '../counter-scope';
import { availableFeatures, featureContext } from 'src/features/launcher/registry';

describe('isCounterPathAllowed', () => {
  it.each(['/pos', '/products', '/products/12', '/invoices/abc', '/shift-cash', '/fnb/order/1', '/features', '/profile', '/settings/language', '/'])(
    'cho phép %s',
    (path) => expect(isCounterPathAllowed(path)).toBe(true)
  );

  it.each(['/home', '/checkin', '/schedule', '/payroll', '/chat', '/assistant', '/admin/revenue', '/manage/approvals', '/qr-login', '/login-sessions', '/shift-register', '/posx'])(
    'chặn %s',
    (path) => expect(isCounterPathAllowed(path)).toBe(false)
  );
});

describe('tiện ích ở máy quầy', () => {
  const staff = { id: 'u1', role: 'Staff', roles: ['Staff'], permissions: [] } as any;
  const owner = { id: 'u2', role: 'Admin', roles: ['Admin'], permissions: [] } as any;

  it('nhân viên: bán hàng, hàng hoá, hoá đơn (mở cho mọi người ở quầy), kiểm tiền ca', () => {
    const keys = availableFeatures(staff, featureContext(staff, 'retail', true)).map((f) => f.key);
    expect(keys).toEqual(['pos', 'products', 'invoices', 'shift-cash']);
  });

  it('chủ cửa hàng ở quầy cũng chỉ có bộ bán hàng', () => {
    const keys = availableFeatures(owner, featureContext(owner, 'retail', true)).map((f) => f.key);
    expect(keys.every((k) => ['pos', 'products', 'invoices', 'shift-cash'].includes(k))).toBe(true);
    expect(keys).not.toContain('checkin');
    expect(keys).not.toContain('users');
  });

  it('điện thoại (không phải máy quầy): nhân viên không thấy hoá đơn như trước', () => {
    const keys = availableFeatures(staff, featureContext(staff, 'retail')).map((f) => f.key);
    expect(keys).not.toContain('invoices');
    expect(keys).toContain('checkin');
  });
});
