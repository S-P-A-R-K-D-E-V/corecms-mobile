import type { AuthUser } from 'src/auth/auth-context';
import { PERMISSIONS, hasAllPermissions } from 'src/auth/permissions';

// ----------------------------------------------------------------------
// Quyền ở màn Nhập hàng — khớp Core-be (purchase.*) và core-fe (src/sections/pos/purchase-order/purchase-access.ts).
// Mặc định Admin, Manager đủ hết; vai trò tuỳ chỉnh theo quyền được cấp (vd "Thủ kho" chỉ nhận hàng).
// ----------------------------------------------------------------------

const P = PERMISSIONS.purchase;

/** Tạo đơn: form tải nhà cung cấp và dùng giá vốn làm giá nhập. */
export const PURCHASE_CREATE_PERMISSIONS: readonly string[] = [
  P.read,
  P.create,
  PERMISSIONS.supplier.read,
  PERMISSIONS.products.costRead,
];

export function purchaseAccessFor(user: AuthUser | null | undefined) {
  return {
    canRead: hasAllPermissions(user, [P.read]),
    canCreate: hasAllPermissions(user, PURCHASE_CREATE_PERMISSIONS),
    canConfirm: hasAllPermissions(user, [P.read, P.confirm]),
    canReceive: hasAllPermissions(user, [P.read, P.receive]),
  };
}
