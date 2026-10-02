import { useQuery, useQueryClient } from '@tanstack/react-query';

import axiosInstance, { endpoints } from 'src/api/axios';
import { toast } from 'src/components/overlay';
import { t } from 'src/i18n';
import { extractApiError, hasApiErrorCode } from 'src/services/error';
import { signInWithApple } from 'src/features/auth/apple-sign-in';
import type { LinkResult } from 'src/features/auth/web-link';

// ----------------------------------------------------------------------
// Các Google/Apple đã gắn vào tài khoản đang đăng nhập (GET /auth/oauth-connections). Mỗi loại gắn được
// MỘT tài khoản (1 Google + 1 Apple) — muốn đổi thì gỡ cái cũ rồi liên kết lại; gắn thêm cùng loại BE
// trả 409 Auth.ProviderAlreadyLinked. Tài khoản cũ có thể còn >1 cùng loại (giữ nguyên), gỡ theo id.
// ----------------------------------------------------------------------

export type OAuthConnection = { id: string; provider: string; email: string | null; connectedAt: string };

export const LINKED_ACCOUNTS_KEY = ['auth', 'oauth-connections'] as const;

export const PROVIDER_LABEL: Record<string, string> = { google: 'Google', apple: 'Apple', facebook: 'Facebook' };

export function providerLabel(provider: string | null | undefined): string {
  return (provider && PROVIDER_LABEL[provider.toLowerCase()]) || provider || '';
}

export const PROVIDER_ALREADY_LINKED = 'Auth.ProviderAlreadyLinked';

/** Đã có liên kết của nhà cung cấp này chưa (so khớp không phân biệt hoa thường). */
export function isProviderLinked(connections: readonly OAuthConnection[], provider: string): boolean {
  const p = provider.toLowerCase();
  return connections.some((c) => c.provider.toLowerCase() === p);
}

/** Câu báo lỗi khi liên kết: 409 đã có liên kết cùng loại → câu rõ ràng theo ngôn ngữ app, còn lại lấy từ API. */
export function linkErrorMessage(err: unknown, provider: string): string {
  return hasApiErrorCode(err, PROVIDER_ALREADY_LINKED)
    ? t('profile.providerAlreadyLinked', { provider: providerLabel(provider) })
    : extractApiError(err);
}

/** Báo kết quả liên kết qua trang auth (dùng chung cho iOS và màn deep link Android). */
export function announceLinkResult(result: LinkResult) {
  if (result.status === 'linked') toast.success(t('profile.linkedToast', { provider: providerLabel(result.provider) }));
  else if (result.status === 'error' && result.reason === 'provider_already_linked')
    toast.error(t('profile.providerAlreadyLinked', { provider: providerLabel(result.provider ?? 'google') }));
  else if (result.status === 'error') toast.error(t('profile.linkFailed'));
}

export function useLinkedAccounts(enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: LINKED_ACCOUNTS_KEY,
    queryFn: async () => (await axiosInstance.get<OAuthConnection[]>(endpoints.auth.oauthConnections)).data,
    enabled,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: LINKED_ACCOUNTS_KEY });

  /** iOS: Sign in with Apple native rồi gắn trên tên miền cửa hàng. false = người dùng tự huỷ. */
  async function linkAppleNative(): Promise<boolean> {
    const apple = await signInWithApple();
    if (!apple) return false;
    await axiosInstance.post(endpoints.auth.oauthConnect, {
      provider: 'apple',
      token: apple.token,
      nonce: apple.extra.nonce,
      authorizationCode: apple.extra.authorizationCode,
    });
    await refresh();
    return true;
  }

  async function unlink(id: string) {
    await axiosInstance.delete(endpoints.auth.oauthDisconnect(id));
    await refresh();
  }

  return { connections: query.data ?? [], loading: query.isLoading, refresh, linkAppleNative, unlink };
}
