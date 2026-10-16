import { productDetailAccessFor } from '../access';

// Màn chi tiết hàng hoá theo quyền products.cost.read / inventory.* (Core-be). Mặc định: Admin đủ hết; Manager thấy giá
// vốn + lịch sử chỉnh tồn, không chỉnh tồn; Staff không thấy gì thêm. Máy quầy chỉ xem tồn.
const MANAGER_DEFAULTS = ['products.cost.read', 'inventory.adjustment.read'];

describe('productDetailAccessFor', () => {
  it('chủ cửa hàng: thấy giá vốn, lịch sử, chỉnh tồn được', () => {
    expect(productDetailAccessFor({ roles: ['Admin'] } as any, false)).toEqual({
      seeCost: true,
      seeAdjustments: true,
      canAdjust: true,
    });
  });

  it('Manager (quyền mặc định) thấy giá vốn + lịch sử, không chỉnh tồn — như trước', () => {
    expect(productDetailAccessFor({ roles: ['Manager'], permissions: MANAGER_DEFAULTS } as any, false)).toEqual({
      seeCost: true,
      seeAdjustments: true,
      canAdjust: false,
    });
  });

  it('nhân viên thường không thấy giá vốn; "Thủ kho" được cấp chỉnh tồn thì chỉnh được', () => {
    expect(productDetailAccessFor({ roles: ['Staff'], permissions: [] } as any, false)).toEqual({
      seeCost: false,
      seeAdjustments: false,
      canAdjust: false,
    });
    const keeper = productDetailAccessFor(
      { roles: ['Staff'], permissions: ['inventory.adjust', 'inventory.adjustment.read'] } as any,
      false
    );
    expect(keeper).toEqual({ seeCost: false, seeAdjustments: true, canAdjust: true });
  });

  it('máy quầy: chỉ xem tồn, kể cả chủ cửa hàng', () => {
    expect(productDetailAccessFor({ roles: ['Admin'] } as any, true)).toEqual({
      seeCost: false,
      seeAdjustments: false,
      canAdjust: false,
    });
  });
});
