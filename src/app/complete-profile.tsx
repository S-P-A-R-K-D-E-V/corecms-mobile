import { Stack } from 'expo-router';

import { CompleteProfileScreen } from 'src/features/profile/CompleteProfileScreen';

export default function CompleteProfile() {
  return (
    <>
      {/* Bắt buộc hoàn tất — chặn vuốt-back iOS, không hiện header mặc định */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <CompleteProfileScreen />
    </>
  );
}
