import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { LoginSessionsScreen } from 'src/features/login-sessions/LoginSessionsScreen';

export default function LoginSessions() {
  return (
    <InternalAppGuard>
      <LoginSessionsScreen />
    </InternalAppGuard>
  );
}
