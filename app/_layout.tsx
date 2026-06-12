import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from 'src/auth/auth-provider';
import { lightTheme } from 'src/theme';
import { usePushRegistration } from 'src/hooks/use-push-registration';

// Registers Expo push token when user logs in; placed inside AuthProvider so
// useAuthContext is available.
function PushRegistrationWrapper() {
  usePushRegistration();
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={lightTheme}>
        <AuthProvider>
          <PushRegistrationWrapper />
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
