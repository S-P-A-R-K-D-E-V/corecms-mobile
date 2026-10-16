import { ProfileScreen } from 'src/features/profile/ProfileScreen';
import { CounterMenuScreen } from 'src/features/counter/CounterMenuScreen';
import { useCounterSession } from 'src/features/counter/use-counter-session';

export default function Profile() {
  // Máy quầy không có hồ sơ cá nhân (liên kết tài khoản, thiết bị đăng nhập…) — chỉ menu của quầy.
  return useCounterSession() ? <CounterMenuScreen /> : <ProfileScreen />;
}
