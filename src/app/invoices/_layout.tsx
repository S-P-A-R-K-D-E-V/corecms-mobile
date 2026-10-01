import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';

// Chi tiết hoá đơn: nhân viên mở được hoá đơn vừa bán (core-be cho mọi nhân viên xem theo id).
export default function InvoicesLayout() {
  return (
    <InternalAppGuard>
      <Stack screenOptions={{ headerShown: false }} />
    </InternalAppGuard>
  );
}
