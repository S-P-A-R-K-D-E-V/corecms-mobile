import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';

export default function SettingsLayout() {
  return (
    <InternalAppGuard>
      <Stack screenOptions={{ headerShown: false }} />
    </InternalAppGuard>
  );
}
