import { RoleGuard } from 'src/auth/role-guard';
import { MANAGER_ROLES } from 'src/auth/roles';
import { InvoicesScreen } from 'src/features/invoices/InvoicesScreen';

// Hoá đơn cả cửa hàng: chủ / quản lý.
export default function Invoices() {
  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <InvoicesScreen />
    </RoleGuard>
  );
}
