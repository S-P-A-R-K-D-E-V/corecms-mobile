import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasAllPermissions, hasPermission } from 'src/auth/permissions';

// ----------------------------------------------------------------------
// Quyền ở màn chi tiết hàng hoá — khớp Core-be (products.cost.read, inventory.*). Máy quầy chỉ xem tồn, kể cả quản lý
// đăng nhập ở quầy (server cũng chặn). Quyền thật do API quyết định.
// ----------------------------------------------------------------------

const INV = PERMISSIONS.inventory;

export type ProductDetailAccess = {
  /** Giá vốn trong response — API trả null khi không có quyền, ẩn luôn dòng giá vốn. */
  seeCost: boolean;
  /** Lịch sử chỉnh tồn. */
  seeAdjustments: boolean;
  /** Chỉnh tồn, đẩy lại lần chỉnh tồn sang KiotViet. */
  canAdjust: boolean;
};

export function productDetailAccessFor(user: AuthUser | null | undefined, counterSession: boolean): ProductDetailAccess {
  if (counterSession) return { seeCost: false, seeAdjustments: false, canAdjust: false };
  return {
    seeCost: hasPermission(user, PERMISSIONS.products.costRead),
    seeAdjustments: hasPermission(user, INV.adjustmentRead),
    canAdjust: hasAllPermissions(user, [INV.adjust, INV.adjustmentRead]),
  };
}
