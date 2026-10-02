import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Button, Icon, TextField } from 'src/components/ui';
import { StoreAvatar } from 'src/components/store/StoreAvatar';
import { spring } from 'src/theme/motion';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { extractApiError } from 'src/services/error';
import { useLocaleStore, useT } from 'src/i18n';
import { getStore, storeDomain } from 'src/services/store-config';
import { isAppleSignInAvailable, signInWithApple } from './apple-sign-in';
import { useDiscovery } from './discovery';
import { EmailAccountToggle, NoStoreNotice, OAuthButtons, PasswordField } from './SignInControls';
import { directLoginErrorKey, signInButtons } from './sign-in';
import { discoverErrorMessage } from './use-enter-store';
import { startWebSignIn } from './web-sign-in';

// ----------------------------------------------------------------------
// Bản cửa hàng — trang đăng nhập của cửa hàng máy đang nhớ (đã đăng xuất / hết phiên). Màu cửa hàng.
//   - Google + Apple một hàng (Apple chỉ iOS). Apple: native, đăng nhập thẳng vào cửa hàng này
//     (/auth/oauth-login trên tên miền cửa hàng). Google: qua trang web như màn Chào mừng, mang theo mã
//     cửa hàng này → tài khoản thuộc cửa hàng thì vào thẳng (xem HubCallbackScreen).
//   - "Đăng nhập bằng tài khoản email": mở ngay trên trang Email + Mật khẩu (cửa hàng đã biết — hiện tên,
//     không cần ô cửa hàng) → POST /auth/login trực tiếp trên tên miền cửa hàng, ngay trong app.
//   - "Dùng cửa hàng khác" → màn Chào mừng (KHÔNG quên cửa hàng này cho tới khi vào cửa hàng mới).
// ----------------------------------------------------------------------

export function StoreLoginScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const locale = useLocaleStore((s) => s.locale);
  const { login, loginWithOAuth, sessionOffline, resumingSession, retrySession, authenticated } = useAuthContext();
  const noStore = useDiscovery((s) => s.noStore);
  const dismissNoStore = useDiscovery((s) => s.dismissNoStore);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const store = getStore();
  const storeName = store?.name ?? store?.code ?? '';
  const domain = storeDomain() ?? '';

  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | undefined>();
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const working = busy || authenticated;
  const buttons = signInButtons(Platform.OS, appleAvailable);

  async function handleApple() {
    dismissNoStore();
    setBusy(true);
    try {
      const result = await signInWithApple();
      if (!result) return; // người dùng tự huỷ
      await loginWithOAuth('apple', result.token, result.extra);
      track(AnalyticsEvent.LoginSuccess);
      router.replace('/');
    } catch (err: any) {
      toast.error(extractApiError(err), t('welcome.appleFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    dismissNoStore();
    setBusy(true);
    try {
      const back = await startWebSignIn('google', locale, store?.code ?? null);
      // Android: kết quả đi theo deep link, expo-router tự mở màn auth/hub — không đẩy thêm lần nữa.
      if (back && Platform.OS !== 'android') router.push({ pathname: '/auth/hub', params: back } as any);
    } catch (err) {
      toast.error(discoverErrorMessage(err), t('welcome.googleFailed'));
    } finally {
      setBusy(false);
    }
  }

  function toggleEmail() {
    if (emailOpen) Keyboard.dismiss();
    setEmailOpen((open) => !open);
  }

  async function handleEmailSubmit() {
    const address = email.trim();
    if (working || !address || !password) return;
    setFormError(undefined);
    dismissNoStore();
    setBusy(true);
    try {
      await login(address, password);
      track(AnalyticsEvent.LoginSuccess);
      // Về boot gate (/) — index.tsx chọn màn "nhà" theo role (Admin → dashboard).
      router.replace('/');
    } catch (err: any) {
      // Email chưa xác minh: máy chủ gửi mã OTP → màn nhập mã của cửa hàng này.
      if (err instanceof Error && err.message === 'OTP_REQUIRED') {
        router.push({ pathname: '/(auth)/verify-otp', params: { email: address } } as any);
        return;
      }
      const key = directLoginErrorKey(err);
      setFormError(key ? t(key, { store: storeName }) : extractApiError(err));
    } finally {
      setBusy(false);
    }
  }

  // Sang màn Chào mừng tìm cửa hàng khác nhưng KHÔNG quên cửa hàng này: chỉ thay khi vào được cửa hàng
  // mới. Lùi lại / thoát app giữa chừng thì lần mở sau vẫn về trang đăng nhập của cửa hàng này.
  function handleChangeStore() {
    router.push('/welcome' as any);
  }

  return (
    <KeyboardAvoidingView
      // iOS: ScrollView tự chừa chỗ bàn phím + cuộn tới ô đang nhập. Android (edge-to-edge): đệm đáy.
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      className="flex-1 bg-bg dark:bg-bg-dark"
      style={{ paddingTop: insets.top }}
    >
      {/* Decorative brand glow */}
      <View pointerEvents="none" className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/15" />
      <View pointerEvents="none" className="absolute top-40 -left-20 w-56 h-56 rounded-full bg-secondary/10" />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Math.max(insets.bottom, 16) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexGrow: 1, justifyContent: 'center', gap: 20, paddingVertical: 8 }}>
          {/* Cửa hàng: logo + tên + tên miền */}
          <MotiView
            from={{ opacity: 0, scale: 0.9, translateY: 10 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'spring', ...spring.soft }}
            style={{ alignItems: 'center', gap: 10 }}
          >
            <StoreAvatar name={storeName} logoUrl={store?.logoUrl} color={store?.primaryColor} size={72} />
            <View style={{ alignItems: 'center' }}>
              <Text variant="title2" className="text-center">{storeName}</Text>
              {domain ? <Text tone="muted" className="text-center mt-0.5">{domain}</Text> : null}
            </View>
          </MotiView>

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

          {noStore ? <NoStoreNotice notice={noStore} onClose={dismissNoStore} /> : null}

          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', delay: 200 }}
            style={{ gap: 10 }}
          >
            <View className="gap-1 mb-1">
              <Text variant="subtitle" className="text-center">{t('auth.loginTitle')}</Text>
              <Text variant="bodySmall" tone="muted" className="leading-5 text-center">
                {t(buttons.apple ? 'auth.loginStoreDesc' : 'auth.loginStoreDescNoApple', { store: storeName })}
              </Text>
            </View>

            <OAuthButtons apple={buttons.apple} disabled={working} onGoogle={handleGoogle} onApple={handleApple} />
            <EmailAccountToggle open={emailOpen} disabled={working} onPress={toggleEmail} />

            {emailOpen ? (
              <View className="gap-3.5 pt-2">
                {/* Cửa hàng đã biết: hiện tên thay cho ô mã cửa hàng. */}
                <View className="flex-row items-center gap-2.5 rounded-[10px] bg-ink/5 dark:bg-white/5 px-3 py-2.5">
                  <StoreAvatar name={storeName} logoUrl={store?.logoUrl} color={store?.primaryColor} size={24} />
                  <Text variant="footnote" tone="muted">{t('signIn.storeOf')}</Text>
                  <Text variant="footnote" className="font-semibold flex-1" numberOfLines={1}>{storeName}</Text>
                </View>
                <TextField
                  label={t('emailSignIn.email')}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setFormError(undefined);
                  }}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="username"
                  keyboardType="email-address"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  icon="email-outline"
                  editable={!working}
                />
                <PasswordField
                  ref={passwordRef}
                  label={t('emailSignIn.password')}
                  value={password}
                  onChangeText={(v) => {
                    setPassword(v);
                    setFormError(undefined);
                  }}
                  returnKeyType="go"
                  onSubmitEditing={handleEmailSubmit}
                  error={formError}
                  editable={!working}
                />
                <Button size="lg" autoHeight loading={working} disabled={!email.trim() || !password} onPress={handleEmailSubmit}>
                  {t('emailSignIn.submit')}
                </Button>
                <Text variant="caption" tone="faint" className="text-center leading-4">{t('emailSignIn.forgot')}</Text>
              </View>
            ) : null}
          </MotiView>
        </View>

        <View className="gap-2 pt-3">
          <Button variant="ghost" action="neutral" size="sm" icon="swap-horizontal" disabled={working} onPress={handleChangeStore}>
            {t('auth.otherStore')}
          </Button>
          {domain ? (
            <Text variant="caption" tone="faint" className="text-center">{t('auth.securedBy', { site: domain })}</Text>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
