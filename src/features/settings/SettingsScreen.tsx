import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';

import { Screen, AppHeader, SectionCard, ListItem } from 'src/components/shared';
import { Text, Divider } from 'src/components/ui';
import { useThemePreference } from 'src/theme/ThemeProvider';
import { useAuthContext } from 'src/auth/auth-context';
import { usesAdminShell } from 'src/auth/roles';
import { LauncherEditor } from 'src/features/launcher/LauncherEditor';
import { t } from 'src/i18n';

const themeLabel: Record<string, string> = {
  light: 'Sáng',
  dark: 'Tối',
  system: 'Theo hệ thống',
};

export function SettingsScreen() {
  const { preference } = useThemePreference();
  const { user } = useAuthContext();
  const [editingLauncher, setEditingLauncher] = useState(false);
  const launcherVariant = usesAdminShell(user) ? 'admin' : 'staff';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title={t('settings.title')} back />

      <SectionCard title="Màn hình chính" bodyClassName="pt-0">
        <ListItem
          icon="apps"
          iconTone="primary"
          title="Tùy chỉnh tiện ích"
          subtitle="Chọn & sắp thứ tự lối tắt trên trang chủ"
          onPress={() => setEditingLauncher(true)}
          showChevron
        />
      </SectionCard>

      <SectionCard title={t('settings.appearance')} bodyClassName="pt-0">
        <ListItem
          icon="palette-outline"
          iconTone="secondary"
          title={t('settings.theme')}
          subtitle={themeLabel[preference]}
          onPress={() => router.push('/settings/appearance')}
          showChevron
        />
        <Divider className="ml-12" />
        <ListItem
          icon="format-size"
          iconTone="primary"
          title="Phông chữ & cỡ chữ"
          subtitle="Kiểu chữ, cỡ chữ"
          onPress={() => router.push('/settings/font' as any)}
          showChevron
        />
      </SectionCard>

      <SectionCard title={t('settings.notifications')} bodyClassName="pt-0">
        <ListItem
          icon="bell-cog-outline"
          iconTone="error"
          title={t('settings.notifications')}
          subtitle="Loại thông báo, rung, âm thanh"
          onPress={() => router.push('/settings/notifications')}
          showChevron
        />
      </SectionCard>

      <SectionCard title={t('settings.legal')} bodyClassName="pt-0">
        <ListItem icon="shield-lock-outline" iconTone="info" title={t('settings.privacy')} onPress={() => router.push('/settings/legal?doc=privacy')} showChevron />
        <Divider className="ml-12" />
        <ListItem icon="file-document-outline" iconTone="info" title={t('settings.terms')} onPress={() => router.push('/settings/legal?doc=terms')} showChevron />
        <Divider className="ml-12" />
        <ListItem icon="code-tags" iconTone="muted" title={t('settings.licenses')} onPress={() => router.push('/settings/legal?doc=licenses')} showChevron />
      </SectionCard>

      <View className="items-center py-4">
        <Text variant="caption" tone="faint">CoreCMS Mobile · {t('settings.version')} {version}</Text>
      </View>

      <LauncherEditor
        variant={launcherVariant}
        visible={editingLauncher}
        onClose={() => setEditingLauncher(false)}
      />
    </Screen>
  );
}
