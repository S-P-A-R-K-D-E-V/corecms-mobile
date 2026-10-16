import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { PERMISSIONS } from 'src/auth/permissions';
import { PayrollCycleDetailScreen } from 'src/features/admin-payroll/PayrollCycleDetailScreen';

export default function AdminPayrollDetail() {
  return (
    <RoleGuard permissions={[PERMISSIONS.payroll.recordsRead]}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.payroll} label="Xem bảng lương">
        <PayrollCycleDetailScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
