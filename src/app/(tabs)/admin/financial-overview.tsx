import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { REPORT_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { FinancialOverviewScreen } from 'src/features/admin-reports/FinancialOverviewScreen';

export default function AdminFinancialOverview() {
  return (
    <RoleGuard allPermissions={REPORT_SCREEN_PERMISSIONS.financialOverview}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.reports} label="Xem báo cáo kinh doanh">
        <FinancialOverviewScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
