import { RoleGuard } from 'src/auth/role-guard';
import { REPORT_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { FinancialOverviewScreen } from 'src/features/admin-reports/FinancialOverviewScreen';

export default function AdminFinancialOverview() {
  return (
    <RoleGuard allPermissions={REPORT_SCREEN_PERMISSIONS.financialOverview}>
      <FinancialOverviewScreen />
    </RoleGuard>
  );
}
