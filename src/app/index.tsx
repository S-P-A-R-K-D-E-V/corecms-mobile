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
import { APP_DISPLAY_NAME, getStoreCode, isMultiStore } from 'src/services/store-config';

// Boot gate: decides the first route based on first-run + auth state.
//   first run        → /(onboarding)          (bản CiCi; bản cửa hàng dùng màn Chào mừng)
//   bản cửa hàng chưa gắn cửa hàng → /welcome (Apple / email / mã cửa hàng)
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
        <Text variant="headline" tone="muted" className="tracking-wide">{APP_DISPLAY_NAME}</Text>
        <Spinner />
      </View>
    );
  }

  if (onboardingEnabled && !onboardingDone && !isMultiStore) return <Redirect href="/onboarding" />;
  // Bản app cửa hàng: chưa chọn cửa hàng thì chưa có API để đăng nhập — màn Chào mừng tự tìm cửa hàng.
  if (isMultiStore && !getStoreCode() && !authenticated) return <Redirect href={'/welcome' as any} />;
  if (!authenticated) return <Redirect href="/(auth)/login" />;
  if (user && !isProfileComplete(user)) return <Redirect href={'/complete-profile' as any} />;
  return <Redirect href={homeHref(user) as any} />;
}
