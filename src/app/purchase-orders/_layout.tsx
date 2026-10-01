import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { RoleGuard } from 'src/auth/role-guard';
import { MANAGER_ROLES } from 'src/auth/roles';

// Nhập hàng: chủ / quản lý (core-be PurchaseOrders tạo/xác nhận/nhận hàng là Admin,Manager).
export default function PurchaseOrdersLayout() {
  return (
    <InternalAppGuard>
      <RoleGuard roles={MANAGER_ROLES}>
        <Stack screenOptions={{ headerShown: false }} />
      </RoleGuard>
    </InternalAppGuard>
  );
}
