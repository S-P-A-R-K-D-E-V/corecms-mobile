import { useEffect, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useColorScheme } from 'nativewind';
import * as AppleAuthentication from 'expo-apple-authentication';

import { Text, Button, Icon, Pressable, Spinner, type IconName } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { useLocaleStore, useT, type Locale } from 'src/i18n';
import { spring } from 'src/theme/motion';
import { softShadow } from 'src/theme';
import { APP_DISPLAY_NAME } from 'src/services/store-config';
import { isAppleSignInAvailable, signInWithApple } from './apple-sign-in';
import { runDiscovery } from './discovery';
import { discoverErrorMessage, useEnterStore } from './use-enter-store';

// ----------------------------------------------------------------------
// Màn đầu tiên của bản cửa hàng (toàn cầu). Đăng nhập Apple là lối chính: một lần đăng nhập → app tự
// tìm các cửa hàng của người dùng (app-hub/discover) → 1 cửa hàng thì vào thẳng, nhiều thì chọn.
// Không có Apple (Android) hoặc tài khoản mật khẩu: "Tiếp tục với email". Biết mã cửa hàng: nhập mã
// rồi đăng nhập trên trang web của cửa hàng như trước.
// ----------------------------------------------------------------------

const POINTS: { icon: IconName; key: string }[] = [
  { icon: 'face-recognition', key: 'welcome.point1' },
  { icon: 'calendar-sync-outline', key: 'welcome.point2' },
  { icon: 'robot-happy-outline', key: 'welcome.point3' },
];

function LanguageToggle() {
  const locale = useLocaleStore((s) => s.locale);
  const setPreference = useLocaleStore((s) => s.setPreference);
  const options: { value: Locale; label: string }[] = [
    { value: 'en', label: 'EN' },
    { value: 'vi', label: 'VI' },
  ];
  return (
    <View className="flex-row rounded-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark p-0.5">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => setPreference(o.value)}
          accessibilityRole="button"
          accessibilityState={{ selected: locale === o.value }}
          className={locale === o.value ? 'px-3 py-1 rounded-full bg-primary' : 'px-3 py-1 rounded-full'}
        >
          <Text variant="caption" className={locale === o.value ? 'text-white font-bold' : 'font-semibold'} tone={locale === o.value ? 'inverse' : 'muted'}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function WelcomeScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const { enter, entering } = useEnterStore();

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  async function handleApple() {
    setBusy(true);
    try {
      const apple = await signInWithApple();
      if (!apple) return; // người dùng tự huỷ
      const pending = await runDiscovery({
        provider: 'apple',
        token: apple.token,
        nonce: apple.extra.nonce,
        firstName: apple.extra.firstName,
        lastName: apple.extra.lastName,
        authorizationCode: apple.extra.authorizationCode,
      });
      if (pending.result.stores.length === 1) {
        await enter(pending.result.stores[0]!.code);
      } else {
        router.push('/store-picker' as any);
      }
    } catch (err) {
      toast.error(discoverErrorMessage(err), t('welcome.appleFailed'));
    } finally {
      setBusy(false);
    }
  }

  const working = busy || !!entering;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}>
      <View pointerEvents="none" className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/15" />
      <View pointerEvents="none" className="absolute top-72 -left-28 w-64 h-64 rounded-full bg-secondary/10" />

      <View className="flex-row justify-end px-5 pt-2">
        <LanguageToggle />
      </View>

      <View className="flex-1 justify-center px-7">
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'spring', ...spring.soft }}
          style={{ alignItems: 'center' }}
        >
          <Image
            source={require('../../../assets/store/icon.png')}
            style={{ width: 84, height: 84, borderRadius: 20, ...softShadow }}
            resizeMode="contain"
          />
          <Text variant="title" className="mt-5 text-center">{APP_DISPLAY_NAME}</Text>
          <Text tone="muted" className="text-center mt-2 text-[15px] leading-[22px]">{t('welcome.tagline')}</Text>
        </MotiView>

        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', delay: 150 }}
          style={{ marginTop: 28, gap: 12 }}
        >
          {POINTS.map((p) => (
            <View key={p.key} className="flex-row items-center gap-3">
              <View className="w-9 h-9 rounded-xl items-center justify-center bg-primary-soft">
                <Icon name={p.icon} size={20} tone="primary" />
              </View>
              <Text variant="callout" className="flex-1 font-medium">{t(p.key)}</Text>
            </View>
          ))}
        </MotiView>
      </View>

      <MotiView
        from={{ opacity: 0, translateY: 16 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', delay: 250 }}
        style={{ paddingHorizontal: 28, gap: 10 }}
      >
        {appleAvailable && Platform.OS === 'ios' ? (
          <View style={{ opacity: working ? 0.6 : 1 }} pointerEvents={working ? 'none' : 'auto'}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                colorScheme === 'dark'
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={12}
              style={{ width: '100%', height: 50 }}
              onPress={handleApple}
            />
          </View>
        ) : null}

        <Button
          size="lg"
          variant={appleAvailable ? 'outline' : 'solid'}
          action={appleAvailable ? 'neutral' : 'primary'}
          icon="email-outline"
          disabled={working}
          onPress={() => router.push('/email-sign-in' as any)}
        >
          {t('welcome.continueEmail')}
        </Button>

        <Button variant="ghost" action="neutral" size="md" icon="storefront-outline" disabled={working} onPress={() => router.push('/store-select' as any)}>
          {t('welcome.haveStoreCode')}
        </Button>

        <View className="h-5 items-center justify-center">
          {working ? <Spinner /> : (
            <Pressable onPress={() => router.push('/legal?doc=terms' as any)}>
              <Text variant="caption" tone="faint" className="text-center">{t('welcome.legal')}</Text>
            </Pressable>
          )}
        </View>
      </MotiView>
    </View>
  );
}
