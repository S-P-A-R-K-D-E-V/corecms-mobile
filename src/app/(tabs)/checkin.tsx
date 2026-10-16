import { useAuthContext } from 'src/auth/auth-context';
import { PLATFORM_FEATURES, isPlatformFeatureBlocked } from 'src/auth/platform-features';
import { CheckinScreen } from 'src/features/checkin/CheckinScreen';
import { CheckinBlockedScreen } from 'src/features/checkin/CheckinBlockedScreen';

export default function Checkin() {
  const { user } = useAuthContext();
  if (isPlatformFeatureBlocked(user, PLATFORM_FEATURES.selfCheckIn)) return <CheckinBlockedScreen />;
  return <CheckinScreen />;
}
