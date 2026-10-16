import { Redirect } from 'expo-router';

import { LoginScreen } from 'src/features/auth/LoginScreen';
import { useCounterMode } from 'src/services/counter-mode';

export default function Login() {
  // Máy quầy: không có trang đăng nhập thường — về màn chọn nhân viên (mọi cổng "chưa đăng nhập" đều về đây).
  const counter = useCounterMode((s) => s.device);
  if (counter) return <Redirect href={'/counter' as any} />;
  return <LoginScreen />;
}
