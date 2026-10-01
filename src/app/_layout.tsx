import '../../global.css';
import 'src/services/message-notifications'; // đăng ký handler thông báo OS (gồm lọc tin nhắn)

import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { vars } from 'nativewind';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as ScreenOrientation from 'expo-screen-orientation';

import { AuthProvider } from 'src/auth/auth-provider';
import { useResponsive } from 'src/hooks/use-responsive';
import { usePushRegistration } from 'src/hooks/use-push-registration';
import { useHydrateLauncher } from 'src/features/launcher/store';
import { queryClient } from 'src/services/query/client';
import { RemoteConfigProvider } from 'src/services/remote-config';
import { RootErrorBoundary } from 'src/services/error/ErrorBoundary';
import { checkForUpdate } from 'src/services/app-update';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { ThemeProvider } from 'src/theme/ThemeProvider';
import { paletteVars, useBrandColor } from 'src/theme/brand-color';
import { FontProvider } from 'src/theme/FontProvider';
import { OverlayHost } from 'src/components/overlay';
import { loadStore } from 'src/services/store-config';
import { hydrateLocale, useLocaleStore } from 'src/i18n';

// Keep the native splash up until the Minimal font is ready.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Registers the Expo push token once the user is authenticated. Lives inside
// AuthProvider so useAuthContext is available.
function PushRegistrationWrapper() {
  usePushRegistration();
  return null;
}

// Nạp cấu hình feature-grid (ghim tiện ích) từ AsyncStorage khi mở app.
function LauncherHydrator() {
  useHydrateLauncher();
  return null;
}

// Khoá xoay màn hình theo loại thiết bị: điện thoại luôn đứng (portrait),
// tablet (iPad/Android tablet) được xoay tự do. Không dùng lock cứng ở
// manifest/Info.plist vì cần cùng 1 ngưỡng (TABLET_BREAKPOINT) cho cả 2 nền
// tảng — đồng thời tự xử lý được trường hợp iPad Split View/Slide Over đổi
// kích thước cửa sổ qua lại ngưỡng tablet khi app đang chạy.
function OrientationGuard() {
  const { isTablet } = useResponsive();
  useEffect(() => {
    if (isTablet) {
      ScreenOrientation.unlockAsync().catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [isTablet]);
  return null;
}

export default function RootLayout() {
  // Public Sans (Minimal's primary font). The variable font carries every
  // weight, so existing `font-semibold`/`font-bold` classes keep working.
  const [fontsLoaded, fontError] = useFonts({
    PublicSans: require('../../assets/fonts/PublicSans.ttf'),
  });

  // Bản app cửa hàng: đọc cửa hàng đã chọn TRƯỚC khi AuthProvider gọi API lần đầu (gốc API phụ thuộc
  // cửa hàng). Ngôn ngữ đã chọn cũng nạp trước màn đầu tiên. Bản CiCi trả về ngay.
  const [storeLoaded, setStoreLoaded] = useState(false);
  useEffect(() => {
    Promise.all([loadStore().catch(() => null), hydrateLocale().catch(() => null)]).finally(() => setStoreLoaded(true));
  }, []);
  // Đổi ngôn ngữ → dựng lại navigator để mọi màn đọc lại chữ (t() đọc ngôn ngữ lúc render).
  const locale = useLocaleStore((s) => s.locale);
  // Màu chính theo cửa hàng: biến CSS cho class primary; đổi cửa hàng (chỉ lúc đăng nhập/đổi cửa hàng)
  // → dựng lại navigator để code đọc brand.primary lúc render lấy màu mới.
  const palette = useBrandColor((s) => s.palette);
  const brandVars = useMemo(() => vars(paletteVars(palette)), [palette]);

  useEffect(() => {
    track(AnalyticsEvent.AppOpen);
    void checkForUpdate();
  }, []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && storeLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError, storeLoaded]);

  // Hold on the splash until the font resolves; fall through on error so a
  // font failure never bricks the app (degrades to the system font).
  if ((!fontsLoaded && !fontError) || !storeLoaded) return null;

  return (
    <RootErrorBoundary>
      <SafeAreaProvider>
        <View style={[{ flex: 1 }, brandVars]}>
        <ThemeProvider>
          <FontProvider>
          <QueryClientProvider client={queryClient}>
            <RemoteConfigProvider>
              <AuthProvider>
                <OrientationGuard />
                <PushRegistrationWrapper />
                <LauncherHydrator />
                <StatusBar style="auto" />
                <Stack key={`${locale}-${palette.main}`} screenOptions={{ headerShown: false }} />
                <OverlayHost />
              </AuthProvider>
            </RemoteConfigProvider>
          </QueryClientProvider>
          </FontProvider>
        </ThemeProvider>
        </View>
      </SafeAreaProvider>
    </RootErrorBoundary>
  );
}
