import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { Text, Button, Card, Icon } from 'src/components/ui';
import { CheckInIllustration } from 'src/components/illustrations';
import { spring } from 'src/theme/motion';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { extractApiError } from 'src/services/error';
import { APP_DISPLAY_NAME, getHostApi, isMultiStore, setStoreCode, storeDomain } from 'src/services/store-config';
import { isAppleSignInAvailable, signInWithApple } from './apple-sign-in';

WebBrowser.maybeCompleteAuthSession();

// Bản CiCi: trang đăng nhập web cố định như trước. Bản cửa hàng: trang đăng nhập của cửa hàng đã chọn.
const webLoginUrl = () => (isMultiStore ? `${getHostApi()}/auth/jwt/login` : 'https://cici21chualang.vn/auth/jwt/login');
const siteName = () => (isMultiStore ? storeDomain() ?? '' : 'cici21chualang.vn');

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { loginWithSessionToken, loginWithOAuth } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function handleAppleLogin() {
    setAppleLoading(true);
    try {
      const result = await signInWithApple();
      if (!result) return; // người dùng tự huỷ
      await loginWithOAuth('apple', result.token, result.extra);
      track(AnalyticsEvent.LoginSuccess);
      router.replace('/');
    } catch (err: any) {
      toast.error(extractApiError(err), 'Đăng nhập Apple thất bại');
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleChangeStore() {
    await setStoreCode(null);
    router.replace('/store-select' as any);
  }

  async function handleWebLogin() {
    setLoading(true);
    try {
      const redirectUri = Linking.createURL('auth/callback');
      const loginUrl = `${webLoginUrl()}?mobile=true&redirect_uri=${encodeURIComponent(redirectUri)}`;
      const result = await WebBrowser.openAuthSessionAsync(loginUrl, redirectUri);

      if (result.type === 'success' && result.url) {
        const { queryParams } = Linking.parse(result.url);
        const sessionToken = queryParams?.sessionToken as string | undefined;
        if (sessionToken) {
          await loginWithSessionToken(sessionToken);
          track(AnalyticsEvent.LoginSuccess);
          // Về boot gate (/) — index.tsx chọn màn "nhà" theo role (Admin → dashboard).
          router.replace('/');
          return;
        }
        toast.error('Không nhận được phiên đăng nhập. Vui lòng thử lại.', 'Đăng nhập thất bại');
      }
      // On Android, openAuthSessionAsync returns 'cancel' when the deep link
      // triggers the app to open via intent — handled by src/app/auth/callback.tsx
    } catch (err: any) {
      toast.error(extractApiError(err), 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {/* Decorative brand glow */}
      <View pointerEvents="none" className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/15" />
      <View pointerEvents="none" className="absolute top-40 -left-20 w-56 h-56 rounded-full bg-secondary/10" />

      <View className="flex-1 justify-center px-7 gap-8">
        {/* Brand */}
        <View className="items-center gap-3">
          <MotiView
            from={{ opacity: 0, scale: 0.8, translateY: 10 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'spring', ...spring.soft }}
          >
            <CheckInIllustration size={180} />
          </MotiView>
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', delay: 150 }}
            style={{ alignItems: 'center' }}
          >
            <Text variant="title" className="text-2xl">{APP_DISPLAY_NAME}</Text>
            <Text tone="muted" className="text-center mt-1">
              {isMultiStore ? siteName() : 'Hệ thống quản lý nhân sự & chấm công'}
            </Text>
          </MotiView>
        </View>

        {/* Login card */}
        <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 280 }}>
        <Card className="p-6 gap-2">
          <Text variant="subtitle">Đăng nhập</Text>
          <Text variant="bodySmall" tone="muted" className="leading-5 mb-4">
            {isMultiStore
              ? 'Dùng tài khoản cửa hàng đã mời bạn. Có thể đăng nhập bằng email, Google hoặc Apple.'
              : 'Sử dụng tài khoản cici21chualang.vn. Bạn có thể đăng nhập bằng Google hoặc Facebook ngay trên trang web.'}
          </Text>
          <Button size="lg" icon="web" loading={loading} onPress={handleWebLogin}>
            {`Đăng nhập với ${siteName()}`}
          </Button>
          {appleAvailable && (
            <Button size="lg" variant="outline" action="neutral" icon="apple" loading={appleLoading} onPress={handleAppleLogin} className="mt-2">
              Tiếp tục với Apple
            </Button>
          )}

          <View className="flex-row items-center justify-center gap-3 mt-4">
            <View className="flex-row items-center gap-1">
              <Icon name="email-outline" size={14} tone="faint" />
              <Text variant="caption" tone="faint">Email</Text>
            </View>
            <View className="w-1 h-1 rounded-full bg-line" />
            <View className="flex-row items-center gap-1">
              <Icon name="google" size={14} color="#DB4437" />
              <Text variant="caption" tone="faint">Google</Text>
            </View>
            <View className="w-1 h-1 rounded-full bg-line" />
            <View className="flex-row items-center gap-1">
              <Icon name="facebook" size={14} color="#1877F2" />
              <Text variant="caption" tone="faint">Facebook</Text>
            </View>
          </View>
        </Card>
        </MotiView>

        <Text variant="caption" tone="faint" className="text-center">
          Phiên đăng nhập được bảo mật bởi{'\n'}{siteName()}
        </Text>

        {isMultiStore && (
          <Button variant="ghost" action="neutral" size="sm" icon="swap-horizontal" onPress={handleChangeStore}>
            Đổi cửa hàng
          </Button>
        )}
      </View>
    </View>
  );
}
