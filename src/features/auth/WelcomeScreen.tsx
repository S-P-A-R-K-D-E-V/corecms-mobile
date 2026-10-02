import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, View, type TextInput } from 'react-native';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Button, Icon, Pressable, Spinner, SparkStoreIcon, SparkStoreWordmark, TextField, type IconName } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { StoreAvatar } from 'src/components/store/StoreAvatar';
import { useLocaleStore, useT, type Locale } from 'src/i18n';
import { spring } from 'src/theme/motion';
import { softShadow } from 'src/theme';
import { usePlatformPrimary } from 'src/theme/BrandScope';
import { getStore, lookupStore, type StoreProfile } from 'src/services/store-config';
import { isAppleSignInAvailable, signInWithApple } from './apple-sign-in';
import { runDiscovery, useDiscovery } from './discovery';
import { EmailAccountToggle, NoStoreNotice, OAuthButtons, PasswordField } from './SignInControls';
import { normalizeStoreField, signInButtons, storeLookupErrorKey } from './sign-in';
import { discoverErrorMessage } from './use-enter-store';
import { loadLastStoreField, saveLastStoreField, useAfterDiscovery } from './use-sign-in';
import { startWebSignIn } from './web-sign-in';

// ----------------------------------------------------------------------
// Màn đầu tiên của bản cửa hàng (toàn cầu) — trang đăng nhập có BA nút:
//   - "Tiếp tục với Google" + "Tiếp tục với Apple" (một hàng; Apple chỉ iOS — Android ẩn Apple, chủ quyết
//     định 2026-10-01): OAuth → app tự tìm các cửa hàng gắn với tài khoản đó (app-hub/discover; Google qua
//     trang web, xem web-sign-in.ts) → 1 cửa hàng vào thẳng, nhiều cửa hàng thì chọn, không có thì nhắn rõ.
//   - "Đăng nhập bằng tài khoản email": mở ngay trên trang 3 ô — mã/tên miền cửa hàng, email, mật khẩu.
//     Có ô cửa hàng: tra cửa hàng trước (lookupStore), đăng nhập rồi vào ĐÚNG cửa hàng đó (tài khoản không
//     thuộc cửa hàng → báo lỗi). Bỏ trống: như OAuth (1 → vào, nhiều → chọn).
//   Mật khẩu chỉ gửi tới auth hub qua HTTPS, không lưu / ghi log; ô cửa hàng (không bí mật) nhớ để điền sẵn.
// - Máy còn nhớ một cửa hàng (vào từ "Dùng cửa hàng khác" / "Đổi cửa hàng"): nút "Quay lại <cửa hàng>"
//   về trang đăng nhập của cửa hàng đó — cửa hàng chỉ bị thay khi thật sự vào cửa hàng mới.
// ----------------------------------------------------------------------

// Ba tính năng nổi bật (nội dung chủ app duyệt) — đặt dưới các nút để nút luôn thấy ngay không cần cuộn.
const FEATURES: { icon: IconName; key: string }[] = [
  { icon: 'face-recognition', key: 'welcome.feature1' },
  { icon: 'calendar-sync-outline', key: 'welcome.feature2' },
  { icon: 'cash-multiple', key: 'welcome.feature3' },
];

/** "‹ Quay lại <cửa hàng>" — về trang đăng nhập của cửa hàng máy đang nhớ. */
function BackToStore({ disabled }: { disabled: boolean }) {
  const t = useT();
  const store = getStore();
  if (!store) return null;
  const name = store.name ?? store.code;
  return (
    <Pressable
      onPress={() => router.dismissTo('/(auth)/login' as any)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t('welcome.backToStore', { store: name })}
      className="flex-row items-center gap-2 rounded-full bg-surface dark:bg-surface-dark border border-line dark:border-line-dark pl-1.5 pr-3 py-1"
      style={{ flexShrink: 1, opacity: disabled ? 0.6 : 1 }}
    >
      <Icon name="chevron-left" size={18} tone="muted" />
      <StoreAvatar name={name} logoUrl={store.logoUrl} color={store.primaryColor} size={22} />
      <Text variant="caption" className="font-semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
        {t('welcome.backToStore', { store: name })}
      </Text>
    </Pressable>
  );
}

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
  const platformPrimary = usePlatformPrimary();
  const t = useT();
  const insets = useSafeAreaInsets();
  const locale = useLocaleStore((s) => s.locale);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const { proceed, entering } = useAfterDiscovery();
  const { authenticated } = useAuthContext();
  const noStore = useDiscovery((s) => s.noStore);
  const dismissNoStore = useDiscovery((s) => s.dismissNoStore);

  // Form tài khoản email (mở ngay trên trang).
  const [emailOpen, setEmailOpen] = useState(false);
  const [storeField, setStoreField] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [storeError, setStoreError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
    // Điền sẵn ô cửa hàng gõ lần trước (không đè nếu người dùng đã gõ).
    loadLastStoreField().then((last) => {
      if (last) setStoreField((current) => current || last);
    });
  }, []);

  // Còn đăng nhập = đang đăng xuất để đổi cửa hàng (Hồ sơ → Đổi cửa hàng) hoặc vừa vào xong một cửa hàng:
  // khoá nút cho tới khi xong, không để bắt đầu đăng nhập mới chồng lên.
  const working = busy || !!entering || authenticated;
  const buttons = signInButtons(Platform.OS, appleAvailable);

  async function handleApple() {
    dismissNoStore();
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
      await proceed(pending);
    } catch (err) {
      toast.error(discoverErrorMessage(err), t('welcome.appleFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    dismissNoStore();
    setBusy(true);
    try {
      const back = await startWebSignIn('google', locale);
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
    if (working || !email.trim() || !password) return;
    setStoreError(undefined);
    setFormError(undefined);
    dismissNoStore();
    setBusy(true);
    try {
      // 1) Có ô cửa hàng: cửa hàng phải có thật (mã, tên miền hoặc link) — chưa gửi mật khẩu đi đâu.
      const storeInput = normalizeStoreField(storeField);
      let wanted: StoreProfile | null = null;
      if (storeInput) {
        const found = await lookupStore(storeInput);
        if (!found.ok) {
          setStoreError(t(storeLookupErrorKey(found.reason)));
          return;
        }
        wanted = found.profile;
        void saveLastStoreField(storeInput);
      }

      // 2) Đăng nhập một lần → các cửa hàng của tài khoản → vào đúng cửa hàng đã gõ (hoặc 1 / chọn).
      const pending = await runDiscovery({ email: email.trim(), password });
      const { choice } = await proceed(pending, { wanted, mode: 'strict', notice: false });
      if (choice.kind === 'not_member') {
        setFormError(t('signIn.notMember', { store: wanted?.name ?? wanted?.code ?? storeInput }));
      } else if (choice.kind === 'none') {
        setFormError(t('storePicker.emptyDesc', { email: pending.result.email ?? email.trim() }));
      }
    } catch (err) {
      setFormError(discoverErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      // iOS: ScrollView tự chừa chỗ bàn phím + cuộn tới ô đang nhập (automaticallyAdjustKeyboardInsets).
      // Android (edge-to-edge, cửa sổ không tự co): đệm đáy bằng bàn phím.
      behavior={Platform.OS === 'android' ? 'padding' : undefined}
      className="flex-1 bg-bg dark:bg-bg-dark"
      style={{ paddingTop: insets.top }}
    >
      <View pointerEvents="none" className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-primary/15" />
      <View pointerEvents="none" className="absolute top-72 -left-28 w-64 h-64 rounded-full bg-secondary/10" />

      <View className="flex-row items-center justify-between gap-3 px-5 pt-2 pb-1">
        <View style={{ flexShrink: 1 }}>
          <BackToStore disabled={working} />
        </View>
        <LanguageToggle />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 16) }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexGrow: 1, justifyContent: 'center', gap: 22, paddingVertical: 8 }}>
          {/* Đầu trang gọn: logo + "Chào mừng đến với" + chữ Spark Store hai màu + khẩu hiệu. */}
          <MotiView
            from={{ opacity: 0, translateY: 12 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'spring', ...spring.soft }}
            style={{ alignItems: 'center' }}
          >
            <View style={{ borderRadius: 15, ...softShadow }}>
              <SparkStoreIcon size={64} />
            </View>
            <Text variant="title2" className="mt-4 text-center">{t('welcome.title').split('{brand}')[0].trim()}</Text>
            <SparkStoreWordmark style={{ fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5, marginTop: 2 }} />
            <Text tone="muted" className="text-center mt-1.5 text-[15px] leading-[21px]">{t('welcome.tagline')}</Text>
          </MotiView>

          {noStore ? <NoStoreNotice notice={noStore} onClose={dismissNoStore} /> : null}

          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', delay: 150 }}
            style={{ gap: 10 }}
          >
            <OAuthButtons apple={buttons.apple} disabled={working} onGoogle={handleGoogle} onApple={handleApple} />
            <EmailAccountToggle open={emailOpen} disabled={working} onPress={toggleEmail} />

            {emailOpen ? (
              <View className="gap-3.5 pt-2">
                <View className="gap-1.5">
                  <TextField
                    label={t('signIn.storeLabel')}
                    placeholder={t('signIn.storePlaceholder')}
                    value={storeField}
                    onChangeText={(v) => {
                      setStoreField(v);
                      setStoreError(undefined);
                      setFormError(undefined);
                    }}
                    autoFocus={!storeField}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    keyboardType="url"
                    textContentType="URL"
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => emailRef.current?.focus()}
                    error={storeError}
                    icon="storefront-outline"
                    accentColor={platformPrimary}
                    editable={!working}
                  />
                  <Text variant="caption" tone="faint" className="ml-1 leading-4">{t('signIn.storeHelp')}</Text>
                </View>
                <TextField
                  ref={emailRef}
                  label={t('emailSignIn.email')}
                  value={email}
                  onChangeText={(v) => {
                    setEmail(v);
                    setFormError(undefined);
                  }}
                  autoFocus={!!storeField}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="username"
                  keyboardType="email-address"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  icon="email-outline"
                  accentColor={platformPrimary}
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
                  accentColor={platformPrimary}
                  editable={!working}
                />
                <Button size="lg" autoHeight loading={working} disabled={!email.trim() || !password} onPress={handleEmailSubmit}>
                  {t('emailSignIn.submit')}
                </Button>
                <Text variant="caption" tone="faint" className="text-center leading-4">{t('emailSignIn.forgot')}</Text>
              </View>
            ) : null}
          </MotiView>

          {/* Tính năng nổi bật — ẩn khi đang mở form email cho gọn (bàn phím iPhone SE). */}
          {!emailOpen ? (
            <MotiView
              from={{ opacity: 0, translateY: 12 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', delay: 250 }}
              style={{ gap: 12 }}
            >
              {FEATURES.map((f) => (
                <View key={f.key} className="flex-row items-center gap-3">
                  <View className="w-9 h-9 rounded-xl items-center justify-center bg-primary-soft">
                    <Icon name={f.icon} size={18} color={platformPrimary} />
                  </View>
                  <View className="flex-1">
                    <Text variant="footnote" tone="primary" className="font-semibold">{t(`${f.key}Title`)}</Text>
                    <Text variant="caption" tone="muted">{t(`${f.key}Desc`)}</Text>
                  </View>
                </View>
              ))}
            </MotiView>
          ) : null}
        </View>

        <View className="min-h-5 items-center justify-center pt-3">
          {working && !emailOpen ? (
            <Spinner color={platformPrimary} />
          ) : (
            <Pressable onPress={() => router.push('/legal?doc=terms' as any)} accessibilityRole="link">
              <Text variant="caption" tone="faint" className="text-center">{t('welcome.legal')}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
