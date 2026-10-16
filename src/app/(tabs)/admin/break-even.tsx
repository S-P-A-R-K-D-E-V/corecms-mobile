import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { REPORT_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { BreakEvenReportScreen } from 'src/features/admin-reports/BreakEvenReportScreen';

export default function AdminBreakEven() {
  return (
    <RoleGuard allPermissions={REPORT_SCREEN_PERMISSIONS.breakEven}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.reports} label="Xem báo cáo kinh doanh">
        <BreakEvenReportScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
