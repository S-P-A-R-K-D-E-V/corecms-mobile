import { router } from 'expo-router';
import { create } from 'zustand';

// ----------------------------------------------------------------------
// Điều hướng quanh đăng nhập.
//
// enterApp: vào app sau khi đăng nhập. router.replace('/') chỉ thay màn trên cùng — Chào mừng / chọn cửa hàng /
// trang đăng nhập vẫn nằm dưới, bấm Back (Android) là quay lại đó trong khi đã đăng nhập. Bỏ hết các màn phía dưới
// trước rồi mới về boot gate.
//
// useLeavingStore: đang rời cửa hàng để đăng nhập tài khoản khác (sang Chào mừng TRƯỚC rồi mới đăng xuất máy này).
// Trong lúc đó Chào mừng khoá nút chờ đăng xuất xong; ngoài lúc đó, đã đăng nhập mà tới Chào mừng (vd Back) thì
// về app chứ không đứng chờ mãi.
// ----------------------------------------------------------------------

export function enterApp() {
  if (router.canDismiss()) router.dismissAll();
  router.replace('/');
}

type LeavingState = { leaving: boolean };

export const useLeavingStore = create<LeavingState>(() => ({ leaving: false }));

/** Sang Chào mừng rồi đăng xuất máy này (để đăng nhập tài khoản khác). Cửa hàng hiện tại vẫn được nhớ. */
export async function leaveToWelcome(logout: () => Promise<void>): Promise<void> {
  useLeavingStore.setState({ leaving: true });
  router.replace('/welcome' as any);
  try {
    await logout();
  } catch {
    // Mất mạng / máy chủ lỗi: logout vẫn dọn phiên ở máy (xem AuthProvider.logout).
  } finally {
    useLeavingStore.setState({ leaving: false });
  }
}
