import { View, Image, Alert } from 'react-native';
import { router } from 'expo-router';

import { Screen, SectionCard, ListItem } from 'src/components/shared';
import { Text, Button, Badge, Icon, Divider } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { t } from 'src/i18n';

const ROLE: Record<string, { label: string; tone: 'error' | 'secondary' | 'primary' | 'neutral' }> = {
  Admin: { label: 'Quản trị viên', tone: 'error' },
  Manager: { label: 'Quản lý', tone: 'secondary' },
  Staff: { label: 'Nhân viên', tone: 'primary' },
  User: { label: 'Người dùng', tone: 'neutral' },
};

const TOOLS = [
  { icon: 'cash-register' as const, iconTone: 'success' as const, title: 'Kiểm tiền quầy', subtitle: 'Đối soát tiền mặt cuối ca (cần GPS)', route: '/shift-cash' },
  { icon: 'bell-outline' as const, iconTone: 'error' as const, title: 'Thông báo', subtitle: 'Xem tất cả thông báo', route: '/notifications' },
  { icon: 'clipboard-text-outline' as const, iconTone: 'info' as const, title: 'Yêu cầu chấm công', subtitle: 'Nghỉ phép, điều chỉnh giờ', route: '/attendance', disabled: true },
  { icon: 'calendar-sync-outline' as const, iconTone: 'secondary' as const, title: 'Đăng ký ca làm', subtitle: 'Xem lịch và đăng ký ca', route: '/(tabs)/schedule' },
  { icon: 'swap-horizontal' as const, iconTone: 'warning' as const, title: 'Đổi ca', subtitle: 'Đổi ca với đồng nghiệp', route: '/shift-swap' },
  { icon: 'account-group-outline' as const, iconTone: 'info' as const, title: 'Làm hộ ca', subtitle: 'Đăng / nhận làm hộ ca', route: '/shift-pool' },
];

export function ProfileScreen() {
  const { user, logout } = useAuthContext();
  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || '??';
  const role = ROLE[user?.role ?? ''] ?? { label: user?.role ?? 'Nhân viên', tone: 'neutral' as const };

  function handleLogout() {
    Alert.alert(t('settings.logout'), t('settings.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: async () => {
          track(AnalyticsEvent.Logout);
          try { await logout(); } catch {}
        },
      },
    ]);
  }

  return (
    <Screen scroll>
      {/* Header */}
      <View className="items-center rounded-3xl bg-surface dark:bg-surface-dark p-7 border border-line/60 dark:border-line-dark">
        <View className="p-1 rounded-full border-[3px] border-primary/30 mb-3">
          {user?.photoURL ? (
            <Image source={{ uri: user.photoURL }} className="w-20 h-20 rounded-full" />
          ) : (
            <View className="w-20 h-20 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-3xl font-bold">{initials}</Text>
            </View>
          )}
        </View>
        <Text variant="title" className="text-xl">{user?.firstName} {user?.lastName}</Text>
        <Text tone="muted" className="mt-0.5">{user?.email}</Text>
        <View className="mt-2.5">
          <Badge tone={role.tone}>{role.label}</Badge>
        </View>
      </View>

      {/* Account */}
      <SectionCard title={t('settings.account')} bodyClassName="pt-0">
        <ListItem
          icon="account-edit-outline"
          iconTone="primary"
          title={t('profile.editProfile')}
          subtitle="Họ tên, ảnh đại diện, CCCD, ngân hàng..."
          onPress={() => router.push('/account/edit')}
          showChevron
        />
      </SectionCard>

      {/* Tools */}
      <SectionCard title="Công cụ nhân viên" bodyClassName="pt-0">
        {TOOLS.map((tool, i) => (
          <View key={tool.title}>
            {i > 0 ? <Divider className="ml-12" /> : null}
            <ListItem
              {...tool}
              onPress={() => router.push(tool.route as any)}
              showChevron
              disabled={tool.disabled}
            />
          </View>
        ))}
      </SectionCard>

      {/* App */}
      <SectionCard title="Ứng dụng" bodyClassName="pt-0">
        <ListItem
          icon="cog-outline"
          iconTone="muted"
          title={t('settings.title')}
          subtitle="Giao diện, thông báo, pháp lý"
          onPress={() => router.push('/settings')}
          showChevron
        />
      </SectionCard>

      <Button variant="outline" action="error" icon="logout" onPress={handleLogout} className="mt-1">
        {t('settings.logout')}
      </Button>
      <View className="h-6" />
    </Screen>
  );
}
