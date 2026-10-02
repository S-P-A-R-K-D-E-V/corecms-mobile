import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { Spinner } from 'src/components/ui';
import { parseLinkResult } from 'src/features/auth/web-link';
import { LINKED_ACCOUNTS_KEY, announceLinkResult } from './use-linked-accounts';

// ----------------------------------------------------------------------
// sparkstore://auth/linked?status=…&provider=…[&reason=…] — trang auth chuyển về sau khi liên kết Google/Apple
// (Android qua intent; iOS nhận thẳng ở ProfileScreen nên không vào đây). Báo kết quả, làm mới danh
// sách liên kết rồi quay lại màn trước (Hồ sơ).
// ----------------------------------------------------------------------

/** Đổi màn ngay khi màn này còn đang trượt vào làm react-native-screens (Android) kẹt hiệu ứng mờ. */
const SETTLE_MS = 450;

export function LinkedCallbackScreen() {
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ status?: string; result?: string; provider?: string; reason?: string }>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: LINKED_ACCOUNTS_KEY }),
        new Promise((resolve) => setTimeout(resolve, SETTLE_MS)),
      ]);
      if (cancelled) return;
      announceLinkResult(parseLinkResult(params));
      if (router.canGoBack()) router.back();
      else router.replace('/');
    })();
    return () => {
      cancelled = true;
    };
    // Chạy một lần cho mỗi lần quay về.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.status, params.result, params.provider, params.reason]);

  return (
    <View className="flex-1 items-center justify-center bg-bg dark:bg-bg-dark">
      <Spinner />
    </View>
  );
}
