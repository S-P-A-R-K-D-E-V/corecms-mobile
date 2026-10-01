import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColorScheme } from 'nativewind';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Text, Button, Card, Icon } from 'src/components/ui';
import { CheckInIllustration } from 'src/components/illustrations';
import { StoreAvatar } from 'src/components/store/StoreAvatar';
import { spring } from 'src/theme/motion';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { extractApiError } from 'src/services/error';
import { useT } from 'src/i18n';
import { APP_DISPLAY_NAME, getStore, getWebOrigin, isMultiStore, setStore, storeDomain } from 'src/services/store-config';
import { isAppleSignInAvailable, signInWithApple } from './apple-sign-in';

WebBrowser.maybeCompleteAuthSession();

// Bản CiCi: trang đăng nhập web cố định như trước. Bản cửa hàng: trang đăng nhập của cửa hàng đã chọn
// (+ Apple native đăng nhập thẳng vào cửa hàng đó qua /auth/oauth-login).
const webLoginUrl = () => (isMultiStore ? `${getWebOrigin()}/auth/jwt/login` : 'https://cici21chualang.vn/auth/jwt/login');
const siteName = () => (isMultiStore ? storeDomain() ?? '' : 'cici21chualang.vn');

export function LoginScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const { loginWithSessionToken, loginWithOAuth } = useAuthContext();
  const [loading, setLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const store = getStore();
  const storeName = store?.name ?? store?.code ?? '';

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
      toast.error(extractApiError(err), t('welcome.appleFailed'));
    } finally {
      setAppleLoading(false);
    }
  }

  async function handleChangeStore() {
    await setStore(null);
    router.replace('/welcome' as any);
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
        toast.error(t('auth.noSession'), t('auth.loginFailed'));
      }
      // On Android, openAuthSessionAsync returns 'cancel' when the deep link
      // triggers the app to open via intent — handled by src/app/auth/callback.tsx
    } catch (err: any) {
      toast.error(extractApiError(err), t('auth.loginFailed'));
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
        {/* Brand: bản cửa hàng hiện logo + tên cửa hàng; bản CiCi giữ minh hoạ cũ */}
        <View className="items-center gap-3">
          <MotiView
            from={{ opacity: 0, scale: 0.8, translateY: 10 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'spring', ...spring.soft }}
          >
            {isMultiStore ? (
              <StoreAvatar name={storeName} logoUrl={store?.logoUrl} color={store?.primaryColor} size={84} />
            ) : (
              <CheckInIllustration size={180} />
            )}
          </MotiView>
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', delay: 150 }}
            style={{ alignItems: 'center' }}
          >
            <Text variant="title" className="text-2xl text-center">{isMultiStore ? storeName : APP_DISPLAY_NAME}</Text>
            <Text tone="muted" className="text-center mt-1">
              {isMultiStore ? siteName() : t('auth.loginCiCiSubtitle')}
            </Text>
          </MotiView>
        </View>

        {/* Login card */}
        <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 280 }}>
          <Card className="p-6 gap-2">
            <Text variant="subtitle">{t('auth.loginTitle')}</Text>
            <Text variant="bodySmall" tone="muted" className="leading-5 mb-4">
              {isMultiStore
                ? t(Platform.OS === 'ios' ? 'auth.loginStoreDesc' : 'auth.loginStoreDescNoApple', { store: storeName })
                : t('auth.loginCiCiDesc')}
            </Text>
            {appleAvailable && Platform.OS === 'ios' ? (
              <View style={{ opacity: appleLoading ? 0.6 : 1 }} pointerEvents={appleLoading ? 'none' : 'auto'} className="mb-2">
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                  buttonStyle={
                    colorScheme === 'dark'
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                      : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                  }
                  cornerRadius={12}
                  style={{ width: '100%', height: 50 }}
                  onPress={handleAppleLogin}
                />
              </View>
            ) : null}
            <Button
              size="lg"
              variant={appleAvailable ? 'outline' : 'solid'}
              action={appleAvailable ? 'neutral' : 'primary'}
              icon="web"
              loading={loading}
              onPress={handleWebLogin}
            >
              {isMultiStore ? t('auth.loginWeb') : t('auth.loginWith', { site: siteName() })}
            </Button>

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
              {/* Bản cửa hàng không hiện Apple trên Android (chủ quyết định 2026-10-01). */}
              {isMultiStore ? (
                Platform.OS === 'ios' ? (
                  <>
                    <View className="w-1 h-1 rounded-full bg-line" />
                    <View className="flex-row items-center gap-1">
                      <Icon name="apple" size={14} tone="faint" />
                      <Text variant="caption" tone="faint">Apple</Text>
                    </View>
                  </>
                ) : null
              ) : (
                <>
                  <View className="w-1 h-1 rounded-full bg-line" />
                  <View className="flex-row items-center gap-1">
                    <Icon name="facebook" size={14} color="#1877F2" />
                    <Text variant="caption" tone="faint">Facebook</Text>
                  </View>
                </>
              )}
            </View>
          </Card>
        </MotiView>

        <Text variant="caption" tone="faint" className="text-center">
          {t('auth.securedBy', { site: siteName() })}
        </Text>

        {isMultiStore && (
          <Button variant="ghost" action="neutral" size="sm" icon="swap-horizontal" onPress={handleChangeStore}>
            {t('auth.otherStore')}
          </Button>
        )}
      </View>
    </View>
  );
}
