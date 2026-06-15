import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { Spinner } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';

export default function AuthCallbackScreen() {
  const { sessionToken } = useLocalSearchParams<{ sessionToken: string }>();
  const { loginWithSessionToken } = useAuthContext();

  useEffect(() => {
    if (!sessionToken) {
      router.replace('/(auth)/login');
      return;
    }
    loginWithSessionToken(sessionToken as string)
      .then(() => router.replace('/(tabs)/checkin'))
      .catch(() => router.replace('/(auth)/login'));
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-bg dark:bg-bg-dark">
      <Spinner />
    </View>
  );
}
