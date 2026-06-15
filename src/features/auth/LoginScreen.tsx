import { useState } from 'react';
import { View, Alert, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

import { Text, Button, Card, Icon } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { extractApiError } from 'src/services/error';

WebBrowser.maybeCompleteAuthSession();

const WEB_LOGIN_URL = 'https://cici21chualang.vn/auth/jwt/login';

export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { loginWithSessionToken } = useAuthContext();
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
          router.replace('/(tabs)/checkin');
          return;
        }
        Alert.alert('Đăng nhập thất bại', 'Không nhận được phiên đăng nhập. Vui lòng thử lại.');
      }
      // On Android, openAuthSessionAsync returns 'cancel' when the deep link
      // triggers the app to open via intent — handled by src/app/auth/callback.tsx
    } catch (err: any) {
      Alert.alert('Đăng nhập thất bại', extractApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View className="flex-1 justify-center px-7 gap-8">
        {/* Brand */}
        <View className="items-center gap-3">
          <View style={{ shadowColor: '#C84D71', shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 12 } }}>
            <Image source={require('../../../assets/logofill.png')} style={{ width: 84, height: 84 }} resizeMode="contain" />
          </View>
          <Text variant="title" className="text-2xl">CiCi Internal App</Text>
          <Text tone="muted" className="text-center">Hệ thống quản lý nhân sự & chấm công</Text>
        </View>

        {/* Login card */}
        <Card className="p-6 gap-2">
          <Text variant="subtitle">Đăng nhập</Text>
          <Text variant="bodySmall" tone="muted" className="leading-5 mb-4">
            Sử dụng tài khoản cici21chualang.vn. Bạn có thể đăng nhập bằng Google hoặc Facebook ngay trên trang web.
          </Text>
          <Button size="lg" icon="web" loading={loading} onPress={handleWebLogin}>
            Đăng nhập với cici21chualang.vn
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

        <Text variant="caption" tone="faint" className="text-center">
          Phiên đăng nhập được bảo mật bởi{'\n'}cici21chualang.vn
        </Text>
      </View>
    </View>
  );
}
