import { useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Screen, SectionCard, ListItem, AppHeader } from 'src/components/shared';
import { Text, Button, Badge, Divider, Spinner } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { getLoginSessions, revokeLoginSession, revokeOtherLoginSessions } from 'src/api/login-sessions';
import { extractApiError, hasApiErrorCode } from 'src/services/error';
import { useT } from 'src/i18n';
import type { ILoginSession } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Thiết bị đang đăng nhập: các phiên đăng nhập còn mở của chính tài khoản này (mọi cửa hàng). Đăng xuất một thiết
// bị — hoặc mọi thiết bị khác — từ xa; server cắt ngay (token của thiết bị đó bị từ chối, thôi nhận thông báo đẩy).
// Máy đang cầm không có nút ở đây: dùng Đăng xuất thường trong Hồ sơ.

export const LOGIN_SESSIONS_QUERY_KEY = ['login-sessions'] as const;

const OTHERS = 'others';

const formatTime = (iso: string) => dayjs(iso).format('HH:mm DD/MM/YYYY');

function deviceIcon(session: ILoginSession) {
  if (session.signedInWithQr) return 'qrcode' as const;
  return session.device?.startsWith('App') ? ('cellphone' as const) : ('monitor' as const);
}

export function LoginSessionsScreen() {
  const t = useT();
  const queryClient = useQueryClient();
  const sessionsQ = useQuery({ queryKey: LOGIN_SESSIONS_QUERY_KEY, queryFn: getLoginSessions });
  // Mã phiên đang được đăng xuất, hoặc OTHERS — khoá các nút khác trong lúc chờ.
  const [busy, setBusy] = useState<string | null>(null);

  const sessions = sessionsQ.data ?? [];
  const others = sessions.filter((s) => !s.isCurrent);
  // Chưa biết máy này là phiên nào (token cũ, máy không có sessionToken): "các thiết bị khác" sẽ gồm cả chính nó.
  const knowsCurrent = sessions.some((s) => s.isCurrent);

  const deviceName = (s: ILoginSession) => s.device || t('loginSessions.unknownDevice');

  async function signOut(session: ILoginSession) {
    const ok = await confirm({
      title: t('loginSessions.signOutTitle'),
      message: t('loginSessions.signOutMessage', { device: deviceName(session) }),
      confirmText: t('loginSessions.signOut'),
      destructive: true,
    });
    if (!ok) return;

    setBusy(session.id);
    try {
      await revokeLoginSession(session.id);
      toast.success(t('loginSessions.signedOut', { device: deviceName(session) }));
    } catch (err) {
      // Thiết bị đó vừa tự đăng xuất / hết hạn: không còn gì để thu hồi — chỉ cần tải lại danh sách.
      if (!hasApiErrorCode(err, 'Auth.LoginSessionNotFound')) toast.error(extractApiError(err));
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: LOGIN_SESSIONS_QUERY_KEY });
    }
  }

  async function signOutOthers() {
    const ok = await confirm({
      title: t('loginSessions.signOutOthers'),
      message: t('loginSessions.signOutOthersMessage', { count: others.length }),
      confirmText: t('loginSessions.signOut'),
      destructive: true,
    });
    if (!ok) return;

    setBusy(OTHERS);
    try {
      const revoked = await revokeOtherLoginSessions();
      toast.success(t('loginSessions.signedOutOthers', { count: revoked }));
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(null);
      await queryClient.invalidateQueries({ queryKey: LOGIN_SESSIONS_QUERY_KEY });
    }
  }

  function subtitleOf(session: ILoginSession) {
    const parts = [
      session.ipAddress ? `IP ${session.ipAddress}` : null,
      t('loginSessions.signedInAt', { time: formatTime(session.signedInAt) }),
      session.signedInWithQr ? t('loginSessions.endsAt', { time: formatTime(session.expiresAt) }) : null,
    ];
    return parts.filter(Boolean).join(' · ');
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={sessionsQ.isRefetching} onRefresh={() => sessionsQ.refetch()}>
      <AppHeader title={t('loginSessions.title')} back />
      <Text variant="bodySmall" tone="muted" className="px-1">{t('loginSessions.intro')}</Text>

      {sessionsQ.isLoading ? (
        <View className="py-10 items-center"><Spinner /></View>
      ) : sessionsQ.isError ? (
        <View className="py-8 items-center gap-3 px-6">
          <Text tone="muted" className="text-center">{t('loginSessions.loadFailed')}</Text>
          <Button variant="outline" action="neutral" onPress={() => sessionsQ.refetch()}>{t('common.retry')}</Button>
        </View>
      ) : sessions.length === 0 ? (
        <Text tone="muted" className="text-center py-8">{t('loginSessions.empty')}</Text>
      ) : (
        <SectionCard title={t('loginSessions.listTitle')} count={sessions.length} bodyClassName="pt-0">
          {sessions.map((session, i) => (
            <View key={session.id}>
              {i > 0 ? <Divider className="ml-12" /> : null}
              <ListItem
                icon={deviceIcon(session)}
                iconTone={session.isCurrent ? 'success' : 'secondary'}
                title={deviceName(session)}
                subtitle={subtitleOf(session)}
                right={
                  session.isCurrent ? (
                    <Badge tone="success">{t('loginSessions.thisDevice')}</Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="soft"
                      action="error"
                      fullWidth={false}
                      loading={busy === session.id}
                      disabled={busy !== null}
                      onPress={() => signOut(session)}
                    >
                      {t('loginSessions.signOut')}
                    </Button>
                  )
                }
              />
            </View>
          ))}
        </SectionCard>
      )}

      {knowsCurrent && others.length > 0 ? (
        <View className="px-1">
          <Button
            variant="outline"
            action="error"
            loading={busy === OTHERS}
            disabled={busy !== null}
            onPress={signOutOthers}
          >
            {t('loginSessions.signOutOthers')}
          </Button>
        </View>
      ) : null}
    </Screen>
  );
}
