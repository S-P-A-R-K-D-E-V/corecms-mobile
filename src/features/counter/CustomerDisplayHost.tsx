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
    if (!available || (!counter && !authenticated)) return undefined;
    let cancelled = false;
    const storeName = getStore()?.name ?? APP_DISPLAY_NAME;
    const load = async () => {
      try {
        const config: DisplayConfigDto = counter ? await getCounterDisplayConfig() : await getDisplayConfig(branchId);
        if (cancelled) return;
        customerDisplay.setAds(
          {
            intervalSeconds: config.intervalSeconds,
            slides: config.slides.map((s) => ({ url: getStorageUrl(s.key), kind: s.kind, title: s.title ?? null })),
          },
          storeName
        );
      } catch {
        if (!cancelled) customerDisplay.setAds(null, storeName);
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
