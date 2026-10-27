import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { openInAppBrowser } from 'src/features/assistant/links';
import { getStoreCode, getWebOrigin, isMultiStore, storeDomain } from 'src/services/store-config';
import { decidePushTap } from 'src/services/push-store';
import { inspectionPushRoute, onlineOrderWebUrl } from 'src/services/push-links';

// ----------------------------------------------------------------------
// Chạm vào thông báo đẩy (app đang mở / chạy nền / mở app từ thông báo).
//   Cùng cửa hàng (hoặc push cũ chưa có storeCode): mở app; mã đăng nhập máy quầy mở màn hiện mã; kiểm tra cửa hàng
//   mở màn kiểm / lỗi của tôi; đơn online đã thanh toán mở trang Đơn online trên web của cửa hàng (app chưa có màn
//   này — push-links.ts). Loại khác chưa điều hướng theo link của push.
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
  if (decision.kind === 'sameStore') {
    // Mã đăng nhập máy quầy: mở màn hiện mã to để đọc cho dễ (mã vẫn có trong tiêu đề thông báo).
    const data = (request.content.data ?? {}) as Record<string, unknown>;
    if (data.type === 'counter-login' && typeof data.code === 'string') {
      router.push({
        pathname: '/counter-code' as any,
        params: {
          code: data.code,
          device: typeof data.deviceName === 'string' ? data.deviceName : '',
          branch: typeof data.branchName === 'string' ? data.branchName : '',
          at: String(date),
        },
      });
      return;
    }
    // Kiểm tra cửa hàng: lỗi cần sửa → lỗi của tôi; nhắc kiểm nhanh / báo cáo tuần → màn Kiểm tra cửa hàng.
    const inspectionRoute = inspectionPushRoute(data);
    if (inspectionRoute) {
      router.push(inspectionRoute as any);
      return;
    }
    // Bản cửa hàng chưa gắn cửa hàng nào thì không có trang web để mở (gốc web mặc định không phải của cửa hàng).
    const onlineOrderUrl = onlineOrderWebUrl(data, isMultiStore && !storeDomain() ? null : getWebOrigin());
    if (onlineOrderUrl) openInAppBrowser(onlineOrderUrl);
    return;
  }
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
