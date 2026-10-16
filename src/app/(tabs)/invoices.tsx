import { RoleGuard } from 'src/auth/role-guard';
import { MANAGER_ROLES } from 'src/auth/roles';
import { InvoicesScreen } from 'src/features/invoices/InvoicesScreen';
import { useCounterSession } from 'src/features/counter/use-counter-session';

// Hoá đơn cả cửa hàng: chủ / quản lý. Máy quầy: mọi người đứng quầy (in lại, trả hàng — server cho phiên máy quầy).
export default function Invoices() {
  const counterSession = useCounterSession();
  if (counterSession) return <InvoicesScreen />;
  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <InvoicesScreen />
    </RoleGuard>
  );
}
