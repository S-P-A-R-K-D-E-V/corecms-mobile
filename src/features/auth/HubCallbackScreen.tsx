import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Spinner, Text } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { useT } from 'src/i18n';
import { completeWebSignIn } from './web-sign-in';
import { discoverErrorMessage } from './use-enter-store';
import { useAfterDiscovery } from './use-sign-in';

// ----------------------------------------------------------------------
// sparkstore://auth/hub?code=…&state=… — trang auth.devbyspark.com/sso/start?app=1 chuyển về đây sau
// khi đăng nhập Google/Apple (Android qua intent; iOS do màn đăng nhập đẩy vào). Đổi mã lấy danh sách
// cửa hàng rồi đi tiếp như sau discover: 1 cửa hàng (hoặc đúng cửa hàng của trang đăng nhập đã mở) →
// vào thẳng; nhiều → màn chọn cửa hàng; không có → quay lại trang đăng nhập, hiện lời nhắn.
// ----------------------------------------------------------------------

/** Đổi màn ngay khi màn này còn đang trượt vào làm react-native-screens (Android) kẹt hiệu ứng mờ. */
const SETTLE_MS = 450;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Về trang đăng nhập đã mở đăng nhập web (đang có sẵn dưới stack — không chồng thêm màn mới): trang của
 * cửa hàng nếu mở từ đó, không thì Chào mừng. Chưa biết mở từ đâu (mã lỗi / hết hạn) → lùi một màn.
 */
function backToSignIn(fromStorePage?: boolean) {
  if (fromStorePage === undefined) {
    if (router.canGoBack()) router.back();
    else router.replace('/welcome' as any);
    return;
  }
  router.dismissTo((fromStorePage ? '/(auth)/login' : '/welcome') as any);
}

export function HubCallbackScreen() {
  const t = useT();
  const { code, state } = useLocalSearchParams<{ code?: string; state?: string }>();
  const { proceed } = useAfterDiscovery();

  useEffect(() => {
    let cancelled = false;
    const mountedAt = Date.now();
    const settle = () => sleep(Math.max(0, SETTLE_MS - (Date.now() - mountedAt)));
    (async () => {
      if (typeof code !== 'string' || typeof state !== 'string' || !code || !state) {
        await settle();
        if (!cancelled) backToSignIn();
        return;
      }
      try {
        const pending = await completeWebSignIn(code, state);
        await settle();
        if (cancelled) return;
        const fromStorePage = !!pending.prefer;
        const { choice, entered } = await proceed(pending, {
          wanted: pending.prefer ? { code: pending.prefer } : null,
          mode: 'prefer',
          nav: 'replace',
        });
        // Vào không được (đã báo lỗi) / không có cửa hàng nào (lời nhắn hiện trên trang đăng nhập) → quay lại.
        if ((choice.kind === 'enter' && !entered) || choice.kind === 'none') backToSignIn(fromStorePage);
      } catch (err) {
        await settle();
        if (cancelled) return;
        toast.error(discoverErrorMessage(err), t('auth.loginFailed'));
        backToSignIn();
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
