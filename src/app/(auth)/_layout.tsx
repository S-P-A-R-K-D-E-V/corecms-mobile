import { Stack, Redirect } from 'expo-router';
import { useAuthContext } from 'src/auth/auth-context';

export default function AuthLayout() {
  const { authenticated } = useAuthContext();
  if (authenticated) return <Redirect href="/(tabs)/checkin" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
