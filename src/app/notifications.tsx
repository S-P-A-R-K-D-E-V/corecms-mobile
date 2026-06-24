import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { NotificationsScreen } from 'src/features/notifications/NotificationsScreen';

export default function Notifications() {
  return (
    <InternalAppGuard>
      <NotificationsScreen />
    </InternalAppGuard>
  );
}
