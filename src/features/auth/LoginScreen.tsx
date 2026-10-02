import { useState } from 'react';
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
import { useT } from 'src/i18n';
import { APP_DISPLAY_NAME, isMultiStore } from 'src/services/store-config';
import { StoreLoginScreen } from './StoreLoginScreen';

WebBrowser.maybeCompleteAuthSession();

// Bản CiCi: trang đăng nhập web cố định như trước (Google / Facebook / email ngay trên trang web).
const WEB_LOGIN_URL = 'https://cici21chualang.vn/auth/jwt/login';
const SITE_NAME = 'cici21chualang.vn';

/** Trang đăng nhập: bản cửa hàng → trang của cửa hàng đã nhớ (StoreLoginScreen); bản CiCi → đăng nhập web. */
export function LoginScreen() {
  return isMultiStore ? <StoreLoginScreen /> : <CiCiWebLoginScreen />;
}

function CiCiWebLoginScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { loginWithSessionToken, sessionOffline, resumingSession, retrySession } = useAuthContext();
  const [loading, setLoading] = useState(false);

  async function handleWebLogin() {
    setLoading(true);
    try {
      const redirectUri = Linking.createURL('auth/callback');
      const loginUrl = `${WEB_LOGIN_URL}?mobile=true&redirect_uri=${encodeURIComponent(redirectUri)}`;
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
            <Text variant="title" className="text-2xl text-center">{APP_DISPLAY_NAME}</Text>
            <Text tone="muted" className="text-center mt-1">{t('auth.loginCiCiSubtitle')}</Text>
          </MotiView>
        </View>

        {/* Mở app chưa kết nối được máy chủ nhưng máy vẫn giữ phiên: không phải bị đăng xuất — thử lại là vào. */}
        {sessionOffline ? (
          <View className="rounded-2xl bg-warning/10 border border-warning/30 p-4 gap-3">
            <View className="flex-row gap-3">
              <Icon name="cloud-off-outline" size={20} tone="warning" />
              <Text variant="footnote" tone="muted" className="flex-1">{t('auth.sessionOffline')}</Text>
            </View>
            <Button size="sm" variant="outline" action="neutral" icon="refresh" loading={resumingSession} onPress={() => void retrySession()}>
              {t('common.retry')}
            </Button>
          </View>
        ) : null}

        {/* Login card */}
        <MotiView from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', delay: 280 }}>
          <Card className="p-6 gap-2">
            <Text variant="subtitle">{t('auth.loginTitle')}</Text>
            <Text variant="bodySmall" tone="muted" className="leading-5 mb-4">{t('auth.loginCiCiDesc')}</Text>
            <Button size="lg" icon="web" loading={loading} onPress={handleWebLogin}>
              {t('auth.loginWith', { site: SITE_NAME })}
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
              <View className="w-1 h-1 rounded-full bg-line" />
              <View className="flex-row items-center gap-1">
                <Icon name="facebook" size={14} color="#1877F2" />
                <Text variant="caption" tone="faint">Facebook</Text>
              </View>
            </View>
          </Card>
        </MotiView>

        <Text variant="caption" tone="faint" className="text-center">
          {t('auth.securedBy', { site: SITE_NAME })}
        </Text>
      </View>
    </View>
  );
}
