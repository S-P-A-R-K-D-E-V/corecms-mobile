import { RoleGuard } from 'src/auth/role-guard';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { PERMISSIONS } from 'src/auth/permissions';
import { PayrollComplaintsScreen } from 'src/features/admin-payroll/PayrollComplaintsScreen';

export default function AdminPayrollComplaints() {
  return (
    <RoleGuard allPermissions={[PERMISSIONS.payroll.recordsRead, PERMISSIONS.payroll.complaintReview]}>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.payroll} label="Xem bảng lương">
        <PayrollComplaintsScreen />
      </PlatformFeatureGate>
    </RoleGuard>
  );
}
