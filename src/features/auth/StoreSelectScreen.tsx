import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Text, Button, Card, TextField } from 'src/components/ui';
import { AppHeader } from 'src/components/shared';
import { queryClient } from 'src/services/query/client';
import { useT } from 'src/i18n';
import { SAAS_ZONE, lookupStore, setStore } from 'src/services/store-config';
import { storeLookupErrorKey } from './sign-in';

// ----------------------------------------------------------------------
// Bản app cửa hàng — lối phụ: người dùng biết mã cửa hàng (phần trước .store.devbyspark.com) hoặc địa
// chỉ web của cửa hàng (kể cả tên miền riêng, dán nguyên link). App kiểm tra cửa hàng có thật rồi mới
// lưu; từ đó API đi tới https://<mã>.store.devbyspark.com/api và đăng nhập trên trang web của cửa hàng
// (hoặc Apple trên tên miền cửa hàng).
// ----------------------------------------------------------------------

export function StoreSelectScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    setError(undefined);
    setLoading(true);
    try {
      const result = await lookupStore(code);
      if (!result.ok) {
        setError(t(storeLookupErrorKey(result.reason)));
        return;
      }
      await setStore(result.profile);
      queryClient.clear();
      router.replace('/(auth)/login');
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
      <View pointerEvents="none" className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/15" />

      <View className="px-4 pt-2">
        <AppHeader title="" back onBack={() => (router.canGoBack() ? router.back() : router.replace('/welcome' as any))} />
      </View>

      <View className="flex-1 justify-center px-6 gap-6">
        <View className="gap-1.5">
          <Text variant="title">{t('storeSelect.title')}</Text>
          <Text tone="muted">{t('storeSelect.subtitle')}</Text>
        </View>

        <Card className="p-5 gap-4">
          <TextField
            label={t('storeSelect.label')}
            placeholder={t('storeSelect.placeholder')}
            value={code}
            onChangeText={(v) => {
              setCode(v);
              setError(undefined);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleContinue}
            error={error}
            icon="storefront-outline"
          />
          <Text variant="caption" tone="faint" className="leading-4">
            {t('storeSelect.help', { zone: SAAS_ZONE })}
          </Text>
          <Button size="lg" loading={loading} disabled={!code.trim()} onPress={handleContinue}>
            {t('common.continue')}
          </Button>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}
