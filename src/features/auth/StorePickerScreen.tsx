import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { Text, Button, Card, Icon, PressableScale, Spinner, Badge } from 'src/components/ui';
import { AppHeader } from 'src/components/shared';
import { StoreAvatar } from 'src/components/store/StoreAvatar';
import { useT } from 'src/i18n';
import { useDiscovery } from './discovery';
import { useEnterStore } from './use-enter-store';

// ----------------------------------------------------------------------
// Sau khi đăng nhập một lần (Apple/email): chọn cửa hàng để vào. Không có cửa hàng nào → hướng dẫn nhờ
// quản lý thêm đúng email (Apple "Ẩn email" là trường hợp hay gặp nhất).
// ----------------------------------------------------------------------

const ROLE_KEY: Record<string, string> = {
  Admin: 'storePicker.roleAdmin',
  Manager: 'storePicker.roleManager',
  Staff: 'storePicker.roleStaff',
};

export function StorePickerScreen() {
  const t = useT();
  const insets = useSafeAreaInsets();
  const pending = useDiscovery((s) => s.pending);
  const clear = useDiscovery((s) => s.clear);
  const { enter, entering } = useEnterStore();

  if (!pending) return <Redirect href={'/welcome' as any} />;

  const { result } = pending;
  const email = result.email ?? '';
  const viaApple = pending.via === 'apple';

  function startOver() {
    clear();
    router.replace('/welcome' as any);
  }

  if (result.stores.length === 0) {
    return (
      <View className="flex-1 bg-bg dark:bg-bg-dark px-6" style={{ paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 16) }}>
        <View className="pt-2">
          <AppHeader title="" back onBack={startOver} />
        </View>
        <View className="flex-1 justify-center gap-5">
          <View className="w-16 h-16 rounded-2xl items-center justify-center bg-warning/15 self-center">
            <Icon name="store-search-outline" size={32} tone="warning" />
          </View>
          <View className="gap-2">
            <Text variant="title2" className="text-center">{t('storePicker.emptyTitle')}</Text>
            <Text tone="muted" className="text-center leading-6">{t('storePicker.emptyDesc', { email })}</Text>
          </View>
          {viaApple ? (
            <Card className="p-4 flex-row gap-3">
              <Icon name="apple" size={20} tone="muted" />
              <Text variant="bodySmall" tone="muted" className="flex-1 leading-5">{t('storePicker.emptyAppleHint')}</Text>
            </Card>
          ) : null}
        </View>
        <View className="gap-2.5">
          <Button size="lg" icon="storefront-outline" onPress={() => router.replace('/store-select' as any)}>
            {t('storePicker.useStoreCode')}
          </Button>
          <Button size="lg" variant="outline" action="neutral" onPress={startOver}>
            {t('storePicker.tryAnother')}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2">
        <AppHeader title={t('storePicker.title')} back onBack={startOver} />
        {email ? <Text tone="muted" className="mb-2">{t('storePicker.subtitle', { email })}</Text> : null}
      </View>
      <ScrollView contentContainerClassName="px-4 pt-2 gap-3" contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {result.stores.map((store) => {
          const busy = entering === store.code;
          return (
            <PressableScale key={store.code} onPress={() => enter(store.code)} disabled={!!entering}>
              <Card className="p-4 flex-row items-center gap-3.5">
                <StoreAvatar name={store.name} logoUrl={store.logoUrl} color={store.primaryColor} size={48} />
                <View className="flex-1 gap-0.5">
                  <Text variant="headline" numberOfLines={1}>{store.name}</Text>
                  <Text variant="caption" tone="faint" numberOfLines={1}>{store.host}</Text>
                  <View className="flex-row mt-1">
                    <Badge tone="neutral">{t(ROLE_KEY[store.role] ?? 'storePicker.roleUser')}</Badge>
                  </View>
                </View>
                {busy ? <Spinner /> : <Icon name="chevron-right" size={22} tone="faint" />}
              </Card>
            </PressableScale>
          );
        })}
      </ScrollView>
    </View>
  );
}
