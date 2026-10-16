import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';
import { PayrollCyclesScreen } from 'src/features/admin-payroll/PayrollCyclesScreen';

export default function AdminPayroll() {
  return (
    <RoleGuard permissions={[PERMISSIONS.payroll.recordsRead]}>
      <PayrollCyclesScreen />
    </RoleGuard>
  );
}
