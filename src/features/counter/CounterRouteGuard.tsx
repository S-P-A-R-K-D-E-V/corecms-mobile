import { useEffect } from 'react';
import { router, usePathname } from 'expo-router';

import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { COUNTER_HOME, isCounterPathAllowed } from './counter-scope';
import { useCounterSession } from './use-counter-session';

// ----------------------------------------------------------------------
// Máy quầy có người đăng nhập: mở màn ngoài phạm vi bán hàng (link sâu, nút ở màn dùng chung…) thì quay về Bán
// hàng. Server cũng từ chối API của các màn đó (Counter.FeatureNotAllowed) — đây chỉ để không hiện màn trống / lỗi.
// ----------------------------------------------------------------------

export function CounterRouteGuard() {
  const counterSession = useCounterSession();
  const pathname = usePathname();

  useEffect(() => {
    if (!counterSession || isCounterPathAllowed(pathname)) return;
    toast.info(t('counter.menu.blocked'));
    router.replace(COUNTER_HOME as any);
  }, [counterSession, pathname]);

  return null;
}
