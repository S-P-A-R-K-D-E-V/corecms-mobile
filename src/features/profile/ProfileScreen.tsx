import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Screen, SectionCard, ListItem } from 'src/components/shared';
import { Text, Button, Badge, Avatar, Divider } from 'src/components/ui';
import { StoreAvatar } from 'src/components/store/StoreAvatar';
import { confirm, toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { useT } from 'src/i18n';
import { extractApiError } from 'src/services/error';
import axiosInstance, { endpoints } from 'src/api/axios';
import { getStore, isMultiStore, setStore } from 'src/services/store-config';
import { isAppleSignInAvailable, signInWithApple } from 'src/features/auth/apple-sign-in';

const ROLE: Record<string, { key: string; tone: 'error' | 'secondary' | 'primary' | 'neutral' }> = {
  Admin: { key: 'profile.roleAdmin', tone: 'error' },
  Manager: { key: 'profile.roleManager', tone: 'secondary' },
  Staff: { key: 'profile.roleStaff', tone: 'primary' },
  User: { key: 'profile.roleUser', tone: 'neutral' },
};

const TOOLS = [
  { icon: 'cash-register' as const, iconTone: 'success' as const, titleKey: 'profile.toolCash', subtitleKey: 'profile.toolCashDesc', route: '/shift-cash' },
  { icon: 'bell-outline' as const, iconTone: 'error' as const, titleKey: 'profile.toolNotifications', subtitleKey: 'profile.toolNotificationsDesc', route: '/notifications' },
  { icon: 'calendar-sync-outline' as const, iconTone: 'secondary' as const, titleKey: 'profile.toolSchedule', subtitleKey: 'profile.toolScheduleDesc', route: '/(tabs)/schedule' },
  { icon: 'swap-horizontal' as const, iconTone: 'warning' as const, titleKey: 'profile.toolSwap', subtitleKey: 'profile.toolSwapDesc', route: '/shift-swap' },
  { icon: 'account-group-outline' as const, iconTone: 'info' as const, titleKey: 'profile.toolPool', subtitleKey: 'profile.toolPoolDesc', route: '/shift-pool' },
];

type OAuthConnection = { provider: string; connectedAt: string };

/** Liên kết Sign in with Apple cho tài khoản đang đăng nhập (bản cửa hàng, iOS). */
function useAppleLink(enabled: boolean) {
  const qc = useQueryClient();
  const connections = useQuery({
    queryKey: ['auth', 'oauth-connections'],
    queryFn: async () => (await axiosInstance.get<OAuthConnection[]>(endpoints.auth.oauthConnections)).data,
    enabled,
  });
  const linked = !!connections.data?.some((c) => c.provider?.toLowerCase() === 'apple');

  async function link() {
    const apple = await signInWithApple();
    if (!apple) return false;
    await axiosInstance.post(endpoints.auth.oauthConnect, {
      provider: 'apple',
      token: apple.token,
      nonce: apple.extra.nonce,
      authorizationCode: apple.extra.authorizationCode,
    });
    await qc.invalidateQueries({ queryKey: ['auth', 'oauth-connections'] });
    return true;
  }

  return { linked, loading: connections.isLoading, link };
}

export function ProfileScreen() {
  const t = useT();
  const { user, logout, deleteAccount } = useAuthContext();
  const role = ROLE[user?.role ?? ''];
  const isAdminOrManager =
    user?.role === 'Admin' || user?.role === 'Manager' || (user?.roles ?? []).some((r) => r === 'Admin' || r === 'Manager');
  const store = isMultiStore ? getStore() : null;
  const storeName = store?.name ?? store?.code ?? '';

  const [appleAvailable, setAppleAvailable] = useState(false);
  const [linking, setLinking] = useState(false);
  useEffect(() => {
    if (isMultiStore) isAppleSignInAvailable().then(setAppleAvailable);
  }, []);
  const apple = useAppleLink(isMultiStore && appleAvailable);

  async function handleLogout() {
    const ok = await confirm({
      title: t('settings.logout'),
      message: t('settings.logoutConfirm'),
      confirmText: t('settings.logout'),
      destructive: true,
    });
    if (!ok) return;
    track(AnalyticsEvent.Logout);
    try { await logout(); } catch {}
  }

  async function handleSwitchStore() {
    const ok = await confirm({
      title: t('profile.switchStore'),
      message: t('profile.switchStoreConfirm', { store: storeName }),
      confirmText: t('profile.switchStore'),
    });
    if (!ok) return;
    try { await logout(); } catch {}
    await setStore(null);
    router.replace('/welcome' as any);
  }

  async function handleLinkApple() {
    setLinking(true);
    try {
      if (await apple.link()) toast.success(t('profile.appleLinkedToast'));
    } catch (err) {
      toast.error(extractApiError(err), t('welcome.appleFailed'));
    } finally {
      setLinking(false);
    }
  }

  // App Store yêu cầu xoá tài khoản ngay trong app. Hai bước xác nhận vì không hoàn tác được.
  async function handleDeleteAccount() {
    const first = await confirm({
      title: t('profile.deleteTitle'),
      message: t('profile.deleteMessage'),
      confirmText: t('common.continue'),
      destructive: true,
    });
    if (!first) return;

    const second = await confirm({
      title: t('profile.deleteFinalTitle'),
      message: t('profile.deleteFinalMessage'),
      confirmText: t('profile.deleteForever'),
      destructive: true,
    });
    if (!second) return;

    try {
      await deleteAccount();
      toast.success(t('profile.deleted'));
      router.replace('/');
    } catch (err) {
      toast.error(extractApiError(err), t('profile.deleteFailed'));
    }
  }

  return (
    <Screen scroll>
      {/* Header */}
      <View className="items-center rounded-3xl bg-surface dark:bg-surface-dark p-7 border border-line/60 dark:border-line-dark">
        <View className="p-1 rounded-full border-[3px] border-primary/30 mb-3">
          <Avatar name={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`} uri={user?.photoURL} size={80} />
        </View>
        <Text variant="title" className="text-xl">{user?.firstName} {user?.lastName}</Text>
        <Text tone="muted" className="mt-0.5">{user?.email}</Text>
        <View className="mt-2.5">
          <Badge tone={role?.tone ?? 'neutral'}>{role ? t(role.key) : user?.role ?? t('profile.roleStaff')}</Badge>
        </View>
      </View>

      {/* Cửa hàng đang gắn (bản cửa hàng) */}
      {store ? (
        <SectionCard title={t('profile.store')} bodyClassName="pt-0">
          <View className="flex-row items-center gap-3 py-2">
            <StoreAvatar name={storeName} logoUrl={store.logoUrl} color={store.primaryColor} size={44} />
            <View className="flex-1">
              <Text variant="headline" numberOfLines={1}>{storeName}</Text>
              <Text variant="caption" tone="faint" numberOfLines={1}>{store.host}</Text>
            </View>
          </View>
          <Divider className="ml-12" />
          <ListItem
            icon="swap-horizontal"
            iconTone="secondary"
            title={t('profile.switchStore')}
            onPress={handleSwitchStore}
            showChevron
          />
        </SectionCard>
      ) : null}

      {/* Account */}
      <SectionCard title={t('settings.account')} bodyClassName="pt-0">
        <ListItem
          icon="account-edit-outline"
          iconTone="primary"
          title={t('profile.editProfile')}
          subtitle={t('profile.editProfileDesc')}
          onPress={() => router.push('/account/edit')}
          showChevron
        />
        <Divider className="ml-12" />
        <ListItem
          icon="face-recognition"
          iconTone={user?.hasFaceEmbedding ? 'success' : 'secondary'}
          title={t('profile.faceEnrollment')}
          subtitle={user?.hasFaceEmbedding ? t('profile.faceEnrolled') : t('profile.faceNotEnrolled')}
          onPress={() => router.push('/face-enrollment')}
          showChevron
        />
        {isMultiStore && appleAvailable ? (
          <>
            <Divider className="ml-12" />
            <ListItem
              icon="apple"
              iconTone={apple.linked ? 'success' : 'muted'}
              title={apple.linked ? t('profile.appleLinked') : t('profile.appleLink')}
              subtitle={apple.linked ? undefined : t('profile.appleLinkDesc')}
              onPress={apple.linked || linking || apple.loading ? undefined : handleLinkApple}
              showChevron={!apple.linked}
            />
          </>
        ) : null}
        {isAdminOrManager ? (
          <>
            <Divider className="ml-12" />
            <ListItem
              icon="qrcode-scan"
              iconTone="secondary"
              title={t('profile.kioskPairing')}
              subtitle={t('profile.kioskPairingDesc')}
              onPress={() => router.push('/kiosk-pairing')}
              showChevron
            />
          </>
        ) : null}
      </SectionCard>

      {/* Tools */}
      <SectionCard title={t('profile.tools')} bodyClassName="pt-0">
        {TOOLS.map((tool, i) => (
          <View key={tool.route}>
            {i > 0 ? <Divider className="ml-12" /> : null}
            <ListItem
              icon={tool.icon}
              iconTone={tool.iconTone}
              title={t(tool.titleKey)}
              subtitle={t(tool.subtitleKey)}
              onPress={() => router.push(tool.route as any)}
              showChevron
            />
          </View>
        ))}
      </SectionCard>

      {/* App */}
      <SectionCard title={t('profile.app')} bodyClassName="pt-0">
        <ListItem
          icon="cog-outline"
          iconTone="muted"
          title={t('settings.title')}
          subtitle={t('profile.settingsDesc')}
          onPress={() => router.push('/settings')}
          showChevron
        />
      </SectionCard>

      <Button variant="outline" action="error" icon="logout" onPress={handleLogout} className="mt-1">
        {t('settings.logout')}
      </Button>
      <Button variant="ghost" action="error" size="sm" icon="account-remove-outline" onPress={handleDeleteAccount} className="mt-3">
        {t('profile.deleteAccount')}
      </Button>
      <View className="h-6" />
    </Screen>
  );
}
