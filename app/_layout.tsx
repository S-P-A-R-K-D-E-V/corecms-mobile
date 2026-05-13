import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from 'src/auth/auth-provider';
import { lightTheme } from 'src/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={lightTheme}>
        <AuthProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
