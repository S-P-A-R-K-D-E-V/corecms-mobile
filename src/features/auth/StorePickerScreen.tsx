import { useRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';

import { Text, Button, Card, Icon, PressableScale, Spinner, Badge } from 'src/components/ui';
import { AppHeader } from 'src/components/shared';
import { StoreAvatar } from 'src/components/store/StoreAvatar';
import { useT } from 'src/i18n';
import { usePlatformPrimary } from 'src/theme/BrandScope';
import { getStoreCode, lastStoreFirst } from 'src/services/store-config';
import { useAuthContext } from 'src/auth/auth-context';
import { useDiscovery } from './discovery';
import { useEnterStore } from './use-enter-store';
import { leaveToWelcome } from './enter-app';

// ----------------------------------------------------------------------
// Sau khi đăng nhập một lần (Apple/email): chọn cửa hàng để vào. Không có cửa hàng nào → hướng dẫn nhờ
// quản lý thêm đúng email (Apple "Ẩn email" là trường hợp hay gặp nhất). Cửa hàng máy đang nhớ (vào gần
// nhất) đứng đầu danh sách, kèm nhãn "Dùng gần nhất".
// ----------------------------------------------------------------------

const ROLE_KEY: Record<string, string> = {
  Admin: 'storePicker.roleAdmin',
  Manager: 'storePicker.roleManager',
  Staff: 'storePicker.roleStaff',
};

export function StorePickerScreen() {
  const platformPrimary = usePlatformPrimary();
  const t = useT();
  const insets = useSafeAreaInsets();
  const pending = useDiscovery((s) => s.pending);
  const clear = useDiscovery((s) => s.clear);
  const { enter, entering } = useEnterStore();
  const { authenticated, logout } = useAuthContext();
  // Đang tự lùi về trang đăng nhập (startOver): kết quả discover vừa bỏ — không Redirect chồng lên lần lùi.
  const leaving = useRef(false);

  // Không còn gì để chọn: đã đăng nhập (vd Back sau khi vào cửa hàng) → về app; chưa → Chào mừng.
  if (!pending) return leaving.current ? null : <Redirect href={(authenticated ? '/' : '/welcome') as any} />;

  const { result } = pending;
  const email = result.email ?? '';
  const lastCode = getStoreCode();
  const stores = lastStoreFirst(result.stores);
  const viaApple = pending.via === 'apple';
  // Đổi cửa hàng khi đang đăng nhập: cửa hàng hiện tại ghi "Đang dùng", có lối đăng nhập tài khoản khác.
  const switching = pending.via === 'session' && authenticated;

  function signInAnotherAccount() {
    leaving.current = true;
    clear();
    void leaveToWelcome(logout);
  }

  // Lùi về đúng trang đăng nhập đã mở màn này (Chào mừng, hoặc trang của cửa hàng khi đăng nhập Google /
  // Apple từ đó) — giữ nguyên chữ đã gõ ở đó, không chồng thêm một màn Chào mừng mới. Mở thẳng bằng link
  // (không có gì để lùi) → Chào mừng.
  function startOver() {
    leaving.current = true;
    clear();
    if (router.canGoBack()) router.back();
    else router.replace('/welcome' as any);
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
        {stores.map((store) => {
          const busy = entering === store.code;
          const isLast = !!lastCode && store.code.toLowerCase() === lastCode;
          return (
            <PressableScale key={store.code} onPress={() => enter(store.code)} disabled={!!entering}>
              <Card className="p-4 flex-row items-center gap-3.5">
                <StoreAvatar name={store.name} logoUrl={store.logoUrl} color={store.primaryColor} size={48} />
                <View className="flex-1 gap-0.5">
                  <Text variant="headline" numberOfLines={1}>{store.name}</Text>
                  <Text variant="caption" tone="faint" numberOfLines={1}>{store.host}</Text>
                  <View className="flex-row flex-wrap gap-1.5 mt-1">
                    <Badge tone="neutral">{t(ROLE_KEY[store.role] ?? 'storePicker.roleUser')}</Badge>
                    {isLast ? (
                      <Badge tone="primary" icon={switching ? 'check-circle' : 'history'}>
                        {t(switching ? 'storePicker.current' : 'storePicker.lastUsed')}
                      </Badge>
                    ) : null}
                  </View>
                </View>
                {busy ? <Spinner color={platformPrimary} /> : <Icon name="chevron-right" size={22} tone="faint" />}
              </Card>
            </PressableScale>
          );
        })}
        {switching ? (
          <Button variant="ghost" action="neutral" icon="account-switch-outline" disabled={!!entering} onPress={signInAnotherAccount}>
            {t('storePicker.otherAccount')}
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
}
