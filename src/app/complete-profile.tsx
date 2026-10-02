import { Redirect, Stack } from 'expo-router';

import { useAuthContext } from 'src/auth/auth-context';
import { CompleteProfileScreen } from 'src/features/profile/CompleteProfileScreen';

export default function CompleteProfile() {
  const { loading, authenticated } = useAuthContext();
  // Đăng xuất ngay tại đây (hoặc hết phiên) → về boot gate: trang đăng nhập của cửa hàng đã nhớ.
  if (!loading && !authenticated) return <Redirect href="/" />;
  return (
    <>
      {/* Bắt buộc hoàn tất — chặn vuốt-back iOS, không hiện header mặc định */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <CompleteProfileScreen />
    </>
  );
}
