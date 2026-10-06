import { APP_VARIANT, getStoreCode, onBeforeStoreChange } from 'src/services/store-config';
import { useCart } from 'src/features/pos/cart-store';

import { useWorkingBranch } from './working-branch';

// ----------------------------------------------------------------------
// Dữ liệu trên máy tách theo cửa hàng (chi nhánh đang làm việc, giỏ hàng): khoá = mã cửa hàng app đang gắn; bản
// CiCi chỉ có một cửa hàng nên dùng tên bản build.
// ----------------------------------------------------------------------

export function currentStoreScope(): string {
  return getStoreCode() ?? APP_VARIANT;
}

/** Nạp dữ liệu theo cửa hàng từ máy (chi nhánh đang làm việc + giỏ hàng) — gọi trước khi dựng thanh tab. */
export function hydrateStoreScope(scope: string): Promise<unknown> {
  return Promise.all([useWorkingBranch.getState().hydrate(scope), useCart.getState().hydrate(scope)]);
}

// Sang cửa hàng khác bằng mọi đường (setStore): quên chi nhánh đang làm việc và giỏ hàng của cửa hàng cũ. Lần bán
// còn chưa biết kết quả thì giữ lại (cart-store.forget) để quay lại cửa hàng đó vẫn kiểm tra được.
onBeforeStoreChange((_next, previous) =>
  Promise.all([useWorkingBranch.getState().clear(previous.code), useCart.getState().forget(previous.code)])
);
