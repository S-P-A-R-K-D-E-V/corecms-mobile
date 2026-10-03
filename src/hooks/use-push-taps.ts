import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';

import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { getStoreCode } from 'src/services/store-config';
import { decidePushTap } from 'src/services/push-store';

// ----------------------------------------------------------------------
// Chạm vào thông báo đẩy (app đang mở / chạy nền / mở app từ thông báo).
//   Cùng cửa hàng (hoặc push cũ chưa có storeCode): giữ hành vi cũ — chỉ mở app (app chưa điều hướng theo link
//   của push).
//   Cửa hàng khác (máy còn đăng ký ở cửa hàng cũ): KHÔNG mở theo link — báo đây là thông báo của cửa hàng nào,
//   đăng nhập cửa hàng đó để xem. So với cửa hàng đã nhớ (StoreProfile.code), kể cả khi đang đăng xuất.
// ----------------------------------------------------------------------

/** Lần chạm đã xử lý (listener + getLastNotificationResponseAsync có thể cùng trả một lần chạm lúc mở app). */
const handled = new Set<string>();

function handleResponse(response: Notifications.NotificationResponse) {
  if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
  const { request, date } = response.notification;
  const key = `${request.identifier}:${date}`;
  if (handled.has(key)) return;
  handled.add(key);

  const decision = decidePushTap(request.content.data, getStoreCode());
  if (decision.kind !== 'otherStore') return;
  // Đã báo: tải lại JS (bản cập nhật OTA) không báo lại lần chạm cũ.
  try {
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  } catch {}
  toast.warning(t('push.otherStore', { store: decision.storeLabel }), t('push.otherStoreTitle'));
}

export function usePushTaps() {
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    // Mở app từ thông báo khi app đang tắt: lần chạm tới trước khi listener kịp đăng ký.
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleResponse(response);
      })
      .catch(() => {});
    return () => sub.remove();
  }, []);
}
