import { RoleGuard } from 'src/auth/role-guard';
import { REPORT_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { BreakEvenReportScreen } from 'src/features/admin-reports/BreakEvenReportScreen';

export default function AdminBreakEven() {
  return (
    <RoleGuard allPermissions={REPORT_SCREEN_PERMISSIONS.breakEven}>
      <BreakEvenReportScreen />
    </RoleGuard>
  );
}
