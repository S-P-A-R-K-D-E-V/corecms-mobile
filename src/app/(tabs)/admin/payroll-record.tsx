import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';
import { PayrollRecordDetailScreen } from 'src/features/admin-payroll/PayrollRecordDetailScreen';

export default function AdminPayrollRecord() {
  return (
    <RoleGuard permissions={[PERMISSIONS.payroll.recordsRead]}>
      <PayrollRecordDetailScreen />
    </RoleGuard>
  );
}
