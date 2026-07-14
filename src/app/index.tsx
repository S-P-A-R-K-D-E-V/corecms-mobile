import { useEffect, useState } from 'react';
import { View, Image } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuthContext } from 'src/auth/auth-context';
import { homeHref } from 'src/auth/roles';
import { useFeatureFlag } from 'src/services/remote-config';
import { prefs, PrefKeys } from 'src/services/storage';
import { isProfileComplete } from 'src/services/profile-completion';
import { Text, Spinner } from 'src/components/ui';
import { softShadow } from 'src/theme';

// Boot gate: decides the first route based on first-run + auth state.
//   first run        → /(onboarding)
//   not authenticated → /(auth)/login
//   thiếu hồ sơ bắt buộc → /complete-profile
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
        {/* Dùng chính app icon để đồng bộ 100% với logo trên màn hình chính. */}
        <Image
          source={require('../../assets/icon.png')}
          style={{ width: 92, height: 92, borderRadius: 20, ...softShadow }}
          resizeMode="contain"
        />
        <Text variant="headline" tone="muted" className="tracking-wide">CiCi Internal App</Text>
        <Spinner />
      </View>
    );
  }

  if (onboardingEnabled && !onboardingDone) return <Redirect href="/onboarding" />;
  if (!authenticated) return <Redirect href="/(auth)/login" />;
  if (user && !isProfileComplete(user)) return <Redirect href={'/complete-profile' as any} />;
  return <Redirect href={homeHref(user) as any} />;
}
