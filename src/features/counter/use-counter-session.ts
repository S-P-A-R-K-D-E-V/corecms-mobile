import { useAuthContext } from 'src/auth/auth-context';
import { useCounterMode } from 'src/services/counter-mode';

/** Đang có người đăng nhập trên máy quầy → giao diện rút gọn chỉ còn bán hàng (counter-scope.ts). */
export function useCounterSession(): boolean {
  const { authenticated } = useAuthContext();
  const counter = useCounterMode((s) => !!s.device);
  return counter && authenticated;
}
