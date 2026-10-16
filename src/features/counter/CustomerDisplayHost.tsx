import { useEffect } from 'react';

import { useAuthContext } from 'src/auth/auth-context';
import { getStorageUrl } from 'src/api/axios';
import { getCounterDisplayConfig, getDisplayConfig, type DisplayConfigDto } from 'src/api/counter';
import { useWorkingBranch } from 'src/features/branch/working-branch';
import { useCounterMode } from 'src/services/counter-mode';
import { customerDisplay, useCustomerDisplayAvailable } from 'src/services/customer-display';
import { APP_DISPLAY_NAME, getStore } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Nạp quảng cáo cho màn hình khách khi có màn phụ (máy quầy: theo chi nhánh của máy, chạy cả lúc chưa ai đăng nhập;
// máy thường: theo chi nhánh đang làm việc của người đăng nhập), làm mới mỗi 10 phút. Máy quầy giữ màn hình sáng.
// ----------------------------------------------------------------------

const REFRESH_MS = 10 * 60_000;
// Link slide có chữ ký (hạn 24h) đổi mỗi lần đọc: nội dung không đổi thì giữ link cũ (không phát lại từ đầu mỗi
// 10 phút), chỉ thay link sau khoảng này.
const RESIGN_MS = 12 * 60 * 60_000;

export function CustomerDisplayHost() {
  const available = useCustomerDisplayAvailable();
  const counter = useCounterMode((s) => s.device);
  const { authenticated } = useAuthContext();
  const branchId = useWorkingBranch((s) => s.branch?.id ?? null);

  useEffect(() => {
    customerDisplay.setKeepAwake(!!counter);
  }, [counter]);

  // Đăng xuất: không để giỏ / QR của người trước trên màn khách.
  useEffect(() => {
    if (!authenticated) customerDisplay.reset();
  }, [authenticated]);

  useEffect(() => {
    if (!available) return undefined;
    const storeName = getStore()?.name ?? APP_DISPLAY_NAME;
    // Máy thường chưa ai đăng nhập: chỉ hiện tên cửa hàng (quảng cáo cần đăng nhập để đọc).
    if (!counter && !authenticated) {
      customerDisplay.setAds(null, storeName);
      return undefined;
    }
    let cancelled = false;
    let lastSignature = '';
    let lastSetAt = 0;
    const load = async () => {
      try {
        const config: DisplayConfigDto = counter ? await getCounterDisplayConfig() : await getDisplayConfig(branchId);
        if (cancelled) return;
        const signature = JSON.stringify([config.intervalSeconds, config.slides.map((s) => [s.key, s.kind, s.title ?? ''])]);
        if (signature === lastSignature && Date.now() - lastSetAt < RESIGN_MS) return;
        lastSignature = signature;
        lastSetAt = Date.now();
        customerDisplay.setAds(
          {
            intervalSeconds: config.intervalSeconds,
            slides: config.slides.map((s) => ({ url: s.url || getStorageUrl(s.key), kind: s.kind, title: s.title ?? null })),
          },
          storeName
        );
      } catch {
        if (cancelled) return;
        lastSignature = '';
        customerDisplay.setAds(null, storeName);
      }
    };
    void load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [available, counter, authenticated, branchId]);

  return null;
}
