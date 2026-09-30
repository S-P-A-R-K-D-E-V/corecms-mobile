import { View } from 'react-native';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable, Divider, type IconName } from 'src/components/ui';
import { useLocaleStore, useT, type LanguagePreference } from 'src/i18n';

const OPTIONS: { value: LanguagePreference; labelKey: string; icon: IconName }[] = [
  { value: 'system', labelKey: 'language.system', icon: 'cellphone-cog' },
  { value: 'en', labelKey: 'language.en', icon: 'alphabetical-variant' },
  { value: 'vi', labelKey: 'language.vi', icon: 'alphabetical-variant' },
];

export function LanguageScreen() {
  const t = useT();
  const preference = useLocaleStore((s) => s.preference);
  const setPreference = useLocaleStore((s) => s.setPreference);

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title={t('language.title')} back />
      <SectionCard title={t('settings.language')} bodyClassName="pt-0">
        {OPTIONS.map((opt, i) => (
          <View key={opt.value}>
            {i > 0 ? <Divider /> : null}
            <Pressable
              onPress={() => setPreference(opt.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: preference === opt.value }}
              className="flex-row items-center gap-3 py-3.5"
            >
              <Icon name={opt.icon} size={22} tone={preference === opt.value ? 'primary' : 'muted'} />
              <Text variant="body" className="flex-1 font-medium">{t(opt.labelKey)}</Text>
              {preference === opt.value ? <Icon name="check-circle" size={22} tone="primary" /> : null}
            </Pressable>
          </View>
        ))}
      </SectionCard>
      <Text variant="caption" tone="faint" className="px-1">{t('language.note')}</Text>
    </Screen>
  );
}
