import { RoleGuard } from 'src/auth/role-guard';
import { REPORT_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { RevenueReportScreen } from 'src/features/admin-reports/RevenueReportScreen';

export default function AdminRevenue() {
  return (
    <RoleGuard allPermissions={REPORT_SCREEN_PERMISSIONS.revenue}>
      <RevenueReportScreen />
    </RoleGuard>
  );
}
