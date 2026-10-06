import { cartPaneWidth, hidesTabBar, isSplitPos } from '../pos-layout';

// Bố cục màn Bán hàng: điện thoại / tablet cầm dọc một cột như trước; tablet xoay ngang hai khung, thanh tab nổi ẩn
// để không che hai khung.

describe('bố cục màn Bán hàng', () => {
  it('hai khung chỉ khi là tablet xoay ngang', () => {
    expect(isSplitPos({ isTablet: true, isLandscape: true })).toBe(true);
    expect(isSplitPos({ isTablet: true, isLandscape: false })).toBe(false);
    expect(isSplitPos({ isTablet: false, isLandscape: false })).toBe(false);
    // Điện thoại bị khoá dọc; kể cả có báo ngang cũng giữ bố cục một cột.
    expect(isSplitPos({ isTablet: false, isLandscape: true })).toBe(false);
  });

  it('khung giỏ hàng rộng khoảng 38% màn hình, trong khoảng 360–460', () => {
    expect(cartPaneWidth(1180)).toBe(448);
    expect(cartPaneWidth(1366)).toBe(460);
    expect(cartPaneWidth(800)).toBe(360);
  });

  it('thanh tab nổi chỉ ẩn ở màn Bán hàng hai khung', () => {
    const landscapeTablet = { isTablet: true, isLandscape: true };
    expect(hidesTabBar('pos', landscapeTablet)).toBe(true);
    expect(hidesTabBar('home', landscapeTablet)).toBe(false);
    expect(hidesTabBar('products', landscapeTablet)).toBe(false);
    expect(hidesTabBar('pos', { isTablet: true, isLandscape: false })).toBe(false);
    expect(hidesTabBar('pos', { isTablet: false, isLandscape: false })).toBe(false);
    expect(hidesTabBar(undefined, landscapeTablet)).toBe(false);
  });
});
