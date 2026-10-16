import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { PayrollRecordDetailScreen } from 'src/features/admin-payroll/PayrollRecordDetailScreen';

export default function AdminPayrollRecord() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <PayrollRecordDetailScreen />
    </RoleGuard>
  );
}
