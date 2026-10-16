import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { REPORT_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { RevenueReportScreen } from 'src/features/admin-reports/RevenueReportScreen';

export default function AdminRevenue() {
  return (
    <RoleGuard allPermissions={REPORT_SCREEN_PERMISSIONS.revenue}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.reports} label="Xem báo cáo kinh doanh">
        <RevenueReportScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
