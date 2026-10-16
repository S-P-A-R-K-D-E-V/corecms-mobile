import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { PERMISSIONS } from 'src/auth/permissions';
import { PayrollCyclesScreen } from 'src/features/admin-payroll/PayrollCyclesScreen';

export default function AdminPayroll() {
  return (
    <RoleGuard permissions={[PERMISSIONS.payroll.recordsRead]}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.payroll} label="Xem bảng lương">
        <PayrollCyclesScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
