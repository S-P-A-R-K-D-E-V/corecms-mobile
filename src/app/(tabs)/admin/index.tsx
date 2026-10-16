import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { ADMIN_ROLES } from 'src/auth/roles';
import { AdminDashboardScreen } from 'src/features/admin-dashboard/AdminDashboardScreen';

export default function Admin() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.reports} label="Xem báo cáo kinh doanh">
        <AdminDashboardScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
