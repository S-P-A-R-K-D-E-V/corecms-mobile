import { DEFAULT_PINS, MAX_PINS, availableFeatures, visiblePins } from '../registry';

const staff = { role: 'Staff', roles: ['Staff'] } as any;
const manager = { role: 'Manager', roles: ['Manager'] } as any;
const owner = { role: 'Admin', roles: ['Admin'] } as any;

describe('Dùng nhanh — tối đa 8 ghim', () => {
  it('chỉ hiện mục được phép, giữ thứ tự ghim và cắt ở 8', () => {
    const keys = ['users', 'pos', 'approvals', 'shift-swap', 'products', 'shift-register', 'shift-pool', 'shift-cash', 'notifications', 'chat', 'schedule'];
    // Staff thuần: 'users' (Admin) và 'approvals' (Quản lý) rơi ra, còn lại lấy 8 mục đầu.
    expect(visiblePins(keys, staff).map((f) => f.key)).toEqual([
      'pos', 'shift-swap', 'products', 'shift-register', 'shift-pool', 'shift-cash', 'notifications', 'chat',
    ]);
  });

  it('bộ ghim mặc định không vượt 8 với mọi vai trò', () => {
    for (const user of [staff, manager, owner]) {
      expect(visiblePins(DEFAULT_PINS.staff, user).length).toBeLessThanOrEqual(MAX_PINS);
      expect(visiblePins(DEFAULT_PINS.admin, user).length).toBeLessThanOrEqual(MAX_PINS);
    }
    // Nhân viên thấy ngay nút Bán hàng; quản lý thấy thêm việc quản lý.
    expect(visiblePins(DEFAULT_PINS.staff, staff)[0].key).toBe('pos');
    expect(visiblePins(DEFAULT_PINS.staff, manager).map((f) => f.key)).toContain('approvals');
  });

  it('nhân viên bán được và xem hàng hoá, hoá đơn cả cửa hàng chỉ từ quản lý trở lên', () => {
    const keys = (u: any) => availableFeatures(u).map((f) => f.key);
    expect(keys(staff)).toEqual(expect.arrayContaining(['pos', 'products']));
    expect(keys(staff)).not.toContain('invoices');
    expect(keys(manager)).toContain('invoices');
  });
});
