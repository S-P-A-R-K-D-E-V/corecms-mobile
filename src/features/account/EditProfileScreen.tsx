import { router } from 'expo-router';

import { Screen, AppHeader } from 'src/components/shared';
import { t } from 'src/i18n';

import { PersonalInfoForm } from './PersonalInfoForm';

export function EditProfileScreen() {
  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader title={t('profile.editProfile')} back />
      <PersonalInfoForm variant="edit" onDone={() => router.back()} />
    </Screen>
  );
}
