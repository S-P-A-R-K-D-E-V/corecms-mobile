import { useCallback, useState } from 'react';
import { router } from 'expo-router';

import { DiscoverError } from 'src/api/app-hub';
import { useAuthContext } from 'src/auth/auth-context';
import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { extractApiError } from 'src/services/error';
import { freshTicket, useDiscovery } from './discovery';

/** Thông báo cho lỗi app-hub/discover. */
export function discoverErrorMessage(err: unknown): string {
  if (!(err instanceof DiscoverError)) return extractApiError(err) || t('common.error');
  switch (err.code) {
    case 'invalid_credentials':
      return t('emailSignIn.invalid');
    case 'email_not_verified':
      return t('emailSignIn.notVerified');
    case 'not_active':
      return t('emailSignIn.notActive');
    case 'banned':
      return t('emailSignIn.banned');
    case 'rate_limited':
      return t('emailSignIn.tooMany');
    case 'network':
      return t('common.network');
    case 'invalid_token':
      return t('welcome.appleFailed');
    default:
      return err.message && err.message !== 'unknown' ? err.message : t('common.error');
  }
}

/**
 * Vào một cửa hàng đã tìm được: đổi mã SSO (làm mới nếu quá hạn) lấy phiên, rồi về boot gate.
 * Sau discover chỉ có 1 cửa hàng thì gọi luôn, không qua màn chọn.
 */
export function useEnterStore() {
  const { loginWithDiscoveredStore } = useAuthContext();
  const [entering, setEntering] = useState<string | null>(null);

  const enter = useCallback(
    async (code: string) => {
      setEntering(code);
      try {
        const ticket = await freshTicket(code);
        if (!ticket) {
          toast.error(t('storePicker.expired'));
          useDiscovery.getState().clear();
          router.replace('/welcome' as any);
          return;
        }
        await loginWithDiscoveredStore(ticket.store, ticket.state);
        useDiscovery.getState().clear();
        track(AnalyticsEvent.LoginSuccess);
        router.replace('/');
      } catch (err) {
        toast.error(discoverErrorMessage(err), t('auth.loginFailed'));
      } finally {
        setEntering(null);
      }
    },
    [loginWithDiscoveredStore]
  );

  return { enter, entering };
}
