import { Stack, Redirect } from 'expo-router';
import { useAuthContext } from 'src/auth/auth-context';
import { homeHref } from 'src/auth/roles';

export default function AuthLayout() {
  const { authenticated, user } = useAuthContext();
  if (authenticated) return <Redirect href={homeHref(user) as any} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
