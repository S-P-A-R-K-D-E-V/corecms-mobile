// ----------------------------------------------------------------------
// Bố cục màn Bán hàng theo thiết bị — phần quyết định không dính giao diện.
//   - điện thoại, tablet cầm dọc: một cột như trước (giỏ hàng + thanh toán mở bằng bảng trượt);
//   - tablet xoay ngang: hai khung — chọn hàng bên trái, giỏ hàng + thanh toán bên phải.
// Điện thoại bị khoá dọc (OrientationGuard) nên không bao giờ rơi vào bố cục hai khung.
// ----------------------------------------------------------------------

export type Responsive = { isTablet: boolean; isLandscape: boolean };

/** Hai khung chỉ khi là tablet đang xoay ngang. */
export function isSplitPos({ isTablet, isLandscape }: Responsive): boolean {
  return isTablet && isLandscape;
}

const CART_PANE_MIN = 360;
const CART_PANE_MAX = 460;

/** Bề rộng khung giỏ hàng bên phải: khoảng 38% màn hình, trong khoảng 360–460. */
export function cartPaneWidth(screenWidth: number): number {
  return Math.round(Math.min(CART_PANE_MAX, Math.max(CART_PANE_MIN, screenWidth * 0.38)));
}

/**
 * Thanh tab nổi nằm giữa đáy màn hình nên sẽ đè lên cả hai khung → ẩn ở màn Bán hàng hai khung. Màn đó luôn có
 * nút quay lại ở đầu trang để rời đi; xoay dọc lại thì thanh tab hiện như thường.
 */
export function hidesTabBar(routeName: string | null | undefined, responsive: Responsive): boolean {
  return routeName === 'pos' && isSplitPos(responsive);
}
