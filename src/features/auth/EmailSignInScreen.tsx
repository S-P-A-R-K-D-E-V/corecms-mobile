import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Button, Card, TextField } from 'src/components/ui';
import { AppHeader } from 'src/components/shared';
import { useT } from 'src/i18n';
import { runDiscovery } from './discovery';
import { discoverErrorMessage, useEnterStore } from './use-enter-store';

// ----------------------------------------------------------------------
// Bản cửa hàng: đăng nhập email + mật khẩu một lần → danh sách cửa hàng (app-hub/discover). Dành cho
// Android và cho tài khoản chưa liên kết Apple. Mật khẩu chỉ gửi tới auth.devbyspark.com qua HTTPS và
// không lưu trên máy.
// ----------------------------------------------------------------------

export function EmailSignInScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const { enter, entering } = useEnterStore();

  async function handleSubmit() {
    if (!email.trim() || !password) return;
    setError(undefined);
    setLoading(true);
    try {
      const pending = await runDiscovery({ email: email.trim(), password });
      if (pending.result.stores.length === 1) {
        await enter(pending.result.stores[0]!.code);
      } else {
        router.push('/store-picker' as any);
      }
    } catch (err) {
      setError(discoverErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-bg dark:bg-bg-dark"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="px-4 pt-2">
        <AppHeader title="" back />
      </View>

      <View className="flex-1 justify-center px-6 gap-6">
        <View className="gap-1.5">
          <Text variant="title">{t('emailSignIn.title')}</Text>
          <Text tone="muted">{t('emailSignIn.subtitle')}</Text>
        </View>

        <Card className="p-5 gap-4">
          <TextField
            label={t('emailSignIn.email')}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              setError(undefined);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            keyboardType="email-address"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            icon="email-outline"
          />
          <TextField
            ref={passwordRef}
            label={t('emailSignIn.password')}
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              setError(undefined);
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            error={error}
            icon="lock-outline"
          />
          <Button size="lg" loading={loading || !!entering} disabled={!email.trim() || !password} onPress={handleSubmit}>
            {t('emailSignIn.submit')}
          </Button>
          <Text variant="caption" tone="faint" className="text-center leading-4">
            {t('emailSignIn.forgot')}
          </Text>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
