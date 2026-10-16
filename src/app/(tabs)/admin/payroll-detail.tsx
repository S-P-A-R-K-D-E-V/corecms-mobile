import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';
import { PayrollCycleDetailScreen } from 'src/features/admin-payroll/PayrollCycleDetailScreen';

export default function AdminPayrollDetail() {
  return (
    <RoleGuard permissions={[PERMISSIONS.payroll.recordsRead]}>
      <PayrollCycleDetailScreen />
    </RoleGuard>
  );
}
