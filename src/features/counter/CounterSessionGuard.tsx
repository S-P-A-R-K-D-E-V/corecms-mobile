import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { useAuthContext } from 'src/auth/auth-context';
import { ACCESS_TOKEN_KEY } from 'src/api/session';
import { toast } from 'src/components/overlay';
import { tokenExpiresAt, useCounterMode } from 'src/services/counter-mode';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// Máy quầy: phiên của người đang dùng máy có hạn cố định (hết ca + 30 phút, tối đa 12 giờ — token không gia hạn
// được). Tới giờ thì tự đăng xuất về màn chọn nhân viên, kể cả khi màn hình đang mở yên (không chờ request 401).
// ----------------------------------------------------------------------

export function CounterSessionGuard() {
  const counter = useCounterMode((s) => s.device);
  const { authenticated, user, logout } = useAuthContext();

  useEffect(() => {
    if (!counter || !authenticated) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = async () => {
      if (timer) clearTimeout(timer);
      const exp = tokenExpiresAt(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY));
      if (cancelled || exp == null) return;
      const left = exp - Date.now();
      const fire = () => {
        toast.info(t('counter.sessionEnded'), t('counter.sessionEndedTitle'));
        void logout().catch(() => {});
      };
      if (left <= 0) fire();
      // setTimeout tối đa ~24,8 ngày; phiên máy quầy ≤ 12 giờ.
      else timer = setTimeout(fire, left);
    };

    void schedule();
    // Máy ngủ / app nền lâu: hẹn giờ có thể trễ — quay lại là kiểm tra lại ngay.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void schedule();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      sub.remove();
    };
  }, [counter, authenticated, user?.id, logout]);

  return null;
}
