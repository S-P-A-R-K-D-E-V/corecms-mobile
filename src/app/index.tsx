import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuthContext } from 'src/auth/auth-context';
import { homeHref } from 'src/auth/roles';
import { useFeatureFlag } from 'src/services/remote-config';
import { prefs, PrefKeys } from 'src/services/storage';
import { Text, Spinner, CiCiLogoMark } from 'src/components/ui';

// Boot gate: decides the first route based on first-run + auth state.
//   first run        → /(onboarding)
//   not authenticated → /(auth)/login
//   authenticated     → homeHref(user): Admin → dashboard, còn lại → checkin
export default function Index() {
  const { loading, authenticated, user } = useAuthContext();
  const onboardingEnabled = useFeatureFlag('onboardingEnabled');
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);

  useEffect(() => {
    prefs.getBool(PrefKeys.onboardingDone).then(setOnboardingDone);
  }, []);

  // Splash while we resolve auth + first-run flag.
  if (loading || onboardingDone === null) {
    return (
      <View className="flex-1 items-center justify-center bg-bg dark:bg-bg-dark gap-5">
        <CiCiLogoMark size={80} />
        <Text variant="headline" tone="muted" className="tracking-wide">CiCi Internal App</Text>
        <Spinner />
      </View>
    );
  }

  if (onboardingEnabled && !onboardingDone) return <Redirect href="/onboarding" />;
  if (!authenticated) return <Redirect href="/(auth)/login" />;
  return <Redirect href={homeHref(user) as any} />;
}
