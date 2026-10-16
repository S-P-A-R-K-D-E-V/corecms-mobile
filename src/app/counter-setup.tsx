import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { CounterSetupScreen } from 'src/features/counter/CounterSetupScreen';

export default function CounterSetup() {
  return (
    <InternalAppGuard>
      <CounterSetupScreen />
    </InternalAppGuard>
  );
}
