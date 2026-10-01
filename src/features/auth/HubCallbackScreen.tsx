import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Spinner, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { useT } from 'src/i18n';
import { completeWebSignIn } from './web-sign-in';
import { discoverErrorMessage, useEnterStore } from './use-enter-store';

// ----------------------------------------------------------------------
// sparkstore://auth/hub?code=…&state=… — trang auth.devbyspark.com/sso/start?app=1 chuyển về đây sau
// khi đăng nhập Google/Apple (Android qua intent; iOS do WelcomeScreen đẩy vào). Đổi mã lấy danh sách
// cửa hàng rồi đi tiếp như sau discover: 1 cửa hàng → vào thẳng, còn lại → màn chọn cửa hàng.
// ----------------------------------------------------------------------

/** Đổi màn ngay khi màn này còn đang trượt vào làm react-native-screens (Android) kẹt hiệu ứng mờ. */
const SETTLE_MS = 450;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Về Welcome đang có sẵn dưới stack (không chồng thêm một Welcome mới). */
function backToWelcome() {
  router.dismissTo('/welcome' as any);
}

export function HubCallbackScreen() {
  const t = useT();
  const { code, state } = useLocalSearchParams<{ code?: string; state?: string }>();
  const { enter } = useEnterStore();

  useEffect(() => {
    let cancelled = false;
    const mountedAt = Date.now();
    const settle = () => sleep(Math.max(0, SETTLE_MS - (Date.now() - mountedAt)));
    (async () => {
      if (typeof code !== 'string' || typeof state !== 'string' || !code || !state) {
        await settle();
        if (!cancelled) backToWelcome();
        return;
      }
      try {
        const pending = await completeWebSignIn(code, state);
        await settle();
        if (cancelled) return;
        if (pending.result.stores.length === 1) {
          if (!(await enter(pending.result.stores[0]!.code))) backToWelcome();
        } else {
          router.replace('/store-picker' as any);
        }
      } catch (err) {
        await settle();
        if (cancelled) return;
        toast.error(discoverErrorMessage(err), t('auth.loginFailed'));
        backToWelcome();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Chạy một lần cho mỗi mã.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state]);

  return (
    <View className="flex-1 items-center justify-center gap-3 bg-bg dark:bg-bg-dark">
      <Spinner />
      <Text tone="muted">{t('welcome.finishing')}</Text>
    </View>
  );
}
