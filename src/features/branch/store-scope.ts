import { APP_VARIANT, getStoreCode, onBeforeStoreChange } from 'src/services/store-config';
import { useCart } from 'src/features/pos/cart-store';
import { fnbQueue } from 'src/features/fnb/write-queue';
import { bindQueue, useFnb } from 'src/features/fnb/fnb-store';
import { ensureDeviceId } from 'src/features/fnb/fnb-ids';

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
  // Hàng đợi lệnh ghi F&B: nạp và gửi tiếp các lệnh còn dở của cửa hàng này (không chặn việc dựng thanh tab).
  bindQueue();
  void ensureDeviceId()
    .catch(() => undefined)
    .then(() => fnbQueue.hydrate(scope));
  return Promise.all([useWorkingBranch.getState().hydrate(scope), useCart.getState().hydrate(scope)]);
}

// Sang cửa hàng khác bằng mọi đường (setStore): quên chi nhánh đang làm việc và giỏ hàng của cửa hàng cũ. Lần bán
// còn chưa biết kết quả thì giữ lại (cart-store.forget) để quay lại cửa hàng đó vẫn kiểm tra được.
// Hàng đợi F&B của cửa hàng cũ ngừng gửi nhưng vẫn nằm trên máy — quay lại cửa hàng đó thì gửi tiếp.
onBeforeStoreChange((_next, previous) => {
  fnbQueue.unload();
  useFnb.getState().reset();
  return Promise.all([useWorkingBranch.getState().clear(previous.code), useCart.getState().forget(previous.code)]);
});
