import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { PayrollDetailScreen } from 'src/features/payroll/PayrollDetailScreen';

export default function PayrollDetail() {
  return (
    <PlatformFeatureGate feature={PLATFORM_FEATURES.payrollSelf} label="Xem lương của mình">
      <PayrollDetailScreen />
    </PlatformFeatureGate>
  );
}
