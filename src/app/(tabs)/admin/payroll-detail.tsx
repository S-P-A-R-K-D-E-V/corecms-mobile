import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { PayrollCycleDetailScreen } from 'src/features/admin-payroll/PayrollCycleDetailScreen';

export default function AdminPayrollDetail() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <PayrollCycleDetailScreen />
    </RoleGuard>
  );
}
