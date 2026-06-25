import '../../global.css';
import 'src/services/message-notifications'; // đăng ký handler thông báo OS (gồm lọc tin nhắn)

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { AuthProvider } from 'src/auth/auth-provider';
import { usePushRegistration } from 'src/hooks/use-push-registration';
import { queryClient } from 'src/services/query/client';
import { RemoteConfigProvider } from 'src/services/remote-config';
import { RootErrorBoundary } from 'src/services/error/ErrorBoundary';
import { checkForUpdate } from 'src/services/app-update';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { ThemeProvider } from 'src/theme/ThemeProvider';
import { OverlayHost } from 'src/components/overlay';

// Keep the native splash up until the Minimal font is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Registers the Expo push token once the user is authenticated. Lives inside
// AuthProvider so useAuthContext is available.
function PushRegistrationWrapper() {
  usePushRegistration();
  return null;
}

export default function RootLayout() {
  // Public Sans (Minimal's primary font). The variable font carries every
  // weight, so existing `font-semibold`/`font-bold` classes keep working.
  const [fontsLoaded, fontError] = useFonts({
    PublicSans: require('../../assets/fonts/PublicSans.ttf'),
  });

  useEffect(() => {
    track(AnalyticsEvent.AppOpen);
    void checkForUpdate();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Hold on the splash until the font resolves; fall through on error so a
  // font failure never bricks the app (degrades to the system font).
  if (!fontsLoaded && !fontError) return null;

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <RemoteConfigProvider>
              <AuthProvider>
                <PushRegistrationWrapper />
                <StatusBar style="auto" />
                <Stack screenOptions={{ headerShown: false }} />
                <OverlayHost />
              </AuthProvider>
            </RemoteConfigProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
