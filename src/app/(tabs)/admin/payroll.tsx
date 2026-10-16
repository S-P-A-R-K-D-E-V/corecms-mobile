import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { PayrollCyclesScreen } from 'src/features/admin-payroll/PayrollCyclesScreen';

export default function AdminPayroll() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <PayrollCyclesScreen />
    </RoleGuard>
  );
}
