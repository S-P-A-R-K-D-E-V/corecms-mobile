import { PURCHASE_CREATE_PERMISSIONS, purchaseAccessFor } from '../access';

// Màn Nhập hàng theo quyền purchase.* (Core-be). Mặc định Admin, Manager đủ hết; vai trò tuỳ chỉnh theo quyền được cấp.
const MANAGER_DEFAULTS = [
  'purchase.read',
  'purchase.create',
  'purchase.confirm',
  'purchase.receive',
  'supplier.read',
  'products.cost.read',
];

describe('purchaseAccessFor', () => {
  it('Admin và Manager (quyền mặc định) làm được mọi thao tác', () => {
    const all = { canRead: true, canCreate: true, canConfirm: true, canReceive: true };
    expect(purchaseAccessFor({ roles: ['Admin'] } as any)).toEqual(all);
    expect(purchaseAccessFor({ roles: ['Manager'], permissions: MANAGER_DEFAULTS } as any)).toEqual(all);
  });

  it('"Thủ kho" chỉ xem + nhận hàng: không tạo, không duyệt', () => {
    expect(purchaseAccessFor({ roles: ['Staff'], permissions: ['purchase.read', 'purchase.receive'] } as any)).toEqual({
      canRead: true,
      canCreate: false,
      canConfirm: false,
      canReceive: true,
    });
  });

  it('nhân viên thường không vào được; tạo đơn cần cả nhà cung cấp và giá vốn', () => {
    expect(purchaseAccessFor({ roles: ['Staff'], permissions: [] } as any).canRead).toBe(false);
    expect(PURCHASE_CREATE_PERMISSIONS).toEqual(
      expect.arrayContaining(['purchase.create', 'supplier.read', 'products.cost.read'])
    );
    expect(
      purchaseAccessFor({ roles: ['Staff'], permissions: ['purchase.read', 'purchase.create'] } as any).canCreate
    ).toBe(false);
  });
});
