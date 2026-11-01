import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { NotificationDetailScreen } from 'src/features/notifications/NotificationDetailScreen';

export default function NotificationDetail() {
  return (
    <InternalAppGuard>
      <NotificationDetailScreen />
    </InternalAppGuard>
  );
}
