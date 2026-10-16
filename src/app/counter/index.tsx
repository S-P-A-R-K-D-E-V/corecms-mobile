import { Redirect } from 'expo-router';

import { CounterLockScreen } from 'src/features/counter/CounterLockScreen';
import { useAuthContext } from 'src/auth/auth-context';
import { useCounterMode } from 'src/services/counter-mode';

export default function CounterLock() {
  const device = useCounterMode((s) => s.device);
  const { authenticated } = useAuthContext();
  // Không phải máy quầy, hoặc đã có người đăng nhập → cổng chính chọn màn.
  if (!device || authenticated) return <Redirect href="/" />;
  return <CounterLockScreen />;
}
