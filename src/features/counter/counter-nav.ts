import { router } from 'expo-router';

import { COUNTER_MENU } from './counter-scope';

/**
 * Nút quay lại ở màn mà máy quầy vào thẳng (Kiểm tiền quầy — COUNTER_HOME): luôn về menu máy quầy. Không dùng
 * router.back() / về "/": trang gốc ở máy quầy lại chuyển vào COUNTER_HOME → kẹt vòng (như lỗi Bán hàng 2026-10-19).
 */
export function backToCounterMenu() {
  router.navigate(COUNTER_MENU as any);
}
