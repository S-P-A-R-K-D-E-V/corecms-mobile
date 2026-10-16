import { RoleGuard } from 'src/auth/role-guard';
import { PURCHASE_CREATE_PERMISSIONS } from 'src/features/purchase/access';
import { PurchaseOrderNewScreen } from 'src/features/purchase/PurchaseOrderNewScreen';

export default function PurchaseOrderNew() {
  return (
    <RoleGuard allPermissions={PURCHASE_CREATE_PERMISSIONS}>
      <PurchaseOrderNewScreen />
    </RoleGuard>
  );
}
