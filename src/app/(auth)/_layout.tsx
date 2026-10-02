import { Stack, Redirect } from 'expo-router';
import { useAuthContext } from 'src/auth/auth-context';
import { homeHref } from 'src/auth/roles';
import { getStoreCode, isMultiStore } from 'src/services/store-config';

export default function AuthLayout() {
  const { authenticated, user } = useAuthContext();
  if (authenticated) return <Redirect href={homeHref(user) as any} />;
  // Bản cửa hàng: trang đăng nhập là của cửa hàng đã nhớ — máy chưa/không còn nhớ cửa hàng nào (vd vừa
  // xoá tài khoản) thì về màn Chào mừng tìm cửa hàng.
  if (isMultiStore && !getStoreCode()) return <Redirect href={'/welcome' as any} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
