import { cartPaneWidth } from 'src/features/pos/pos-layout';

// ----------------------------------------------------------------------
// Bố cục F&B — thiết kế cho iPad trước:
//   - tablet (cả dọc lẫn ngang): màn gọi món chia hai khung — thực đơn bên trái, đơn bên phải;
//   - điện thoại: thực đơn toàn màn + thanh đơn nổi, đơn mở bằng bảng trượt.
// Lưới bàn / lưới món tự chia cột theo bề rộng thật của khung.
// ----------------------------------------------------------------------

export const GRID_GAP = 10;

export function isFnbSplit({ isTablet }: { isTablet: boolean }): boolean {
  return isTablet;
}

/** Khung đơn bên phải: ngang dùng cỡ giỏ hàng Bán hàng (360–460); dọc hẹp hơn để thực đơn còn ≥ 3 cột. */
export function orderPaneWidth(width: number, isLandscape: boolean): number {
  if (isLandscape) return cartPaneWidth(width);
  return Math.round(Math.min(380, Math.max(320, width * 0.42)));
}

/** Số cột cho ô rộng tối thiểu `minTile` trong bề rộng `available` (ít nhất `minCols`). */
export function gridColumns(available: number, minTile: number, minCols = 2, gap = GRID_GAP): number {
  if (available <= 0) return minCols;
  return Math.max(minCols, Math.floor((available + gap) / (minTile + gap)));
}

/** Bề rộng mỗi ô khi chia `cols` cột. */
export function tileWidth(available: number, cols: number, gap = GRID_GAP): number {
  return Math.max(0, Math.floor((available - gap * (cols - 1)) / cols));
}
