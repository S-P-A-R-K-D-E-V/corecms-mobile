import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';

// Nhập hàng: theo quyền purchase.read (Core-be; mặc định Admin, Manager). Mỗi thao tác theo quyền riêng của nó.
export default function PurchaseOrdersLayout() {
  return (
    <InternalAppGuard>
      <RoleGuard allPermissions={[PERMISSIONS.purchase.read]}>
        <Stack screenOptions={{ headerShown: false }} />
      </RoleGuard>
    </InternalAppGuard>
  );
}
