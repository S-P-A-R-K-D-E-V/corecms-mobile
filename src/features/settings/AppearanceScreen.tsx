import { View } from 'react-native';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable, Divider, type IconName } from 'src/components/ui';
import { useThemePreference, type ThemePreference } from 'src/theme/ThemeProvider';
import { t } from 'src/i18n';

const OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Sáng', icon: 'white-balance-sunny' },
  { value: 'dark', label: 'Tối', icon: 'weather-night' },
  { value: 'system', label: 'Theo hệ thống', icon: 'cellphone-cog' },
];

export function AppearanceScreen() {
  const { preference, setPreference } = useThemePreference();

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title={t('settings.theme')} back />
      <SectionCard title={t('settings.appearance')} bodyClassName="pt-0">
        {OPTIONS.map((opt, i) => (
          <View key={opt.value}>
            {i > 0 ? <Divider /> : null}
            <Pressable onPress={() => setPreference(opt.value)} className="flex-row items-center gap-3 py-3.5">
              <Icon name={opt.icon} size={22} tone={preference === opt.value ? 'primary' : 'muted'} />
              <Text variant="body" className="flex-1 font-medium">{opt.label}</Text>
              {preference === opt.value ? <Icon name="check-circle" size={22} tone="primary" /> : null}
            </Pressable>
          </View>
        ))}
      </SectionCard>
    </Screen>
  );
}
