import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';

export default function ShiftCashLayout() {
  return (
    <InternalAppGuard>
      <Stack screenOptions={{ headerShown: false }} />
    </InternalAppGuard>
  );
}
