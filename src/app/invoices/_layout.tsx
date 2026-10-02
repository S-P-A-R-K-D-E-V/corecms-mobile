import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';

// Chi tiết hoá đơn: nhân viên mở được hoá đơn vừa bán — core-be chỉ trả đơn chính mình tạo trong hôm nay
// (giờ VN), khác → 404; chủ / quản lý mở mọi đơn.
export default function InvoicesLayout() {
  return (
    <InternalAppGuard>
      <Stack screenOptions={{ headerShown: false }} />
    </InternalAppGuard>
  );
}
