import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { PERMISSIONS } from 'src/auth/permissions';
import { PayrollRecordDetailScreen } from 'src/features/admin-payroll/PayrollRecordDetailScreen';

export default function AdminPayrollRecord() {
  return (
    <RoleGuard permissions={[PERMISSIONS.payroll.recordsRead]}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.payroll} label="Xem bảng lương">
        <PayrollRecordDetailScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
