import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { PayrollListScreen } from 'src/features/payroll/PayrollListScreen';

export default function Payroll() {
  return (
    <PlatformFeatureGate feature={PLATFORM_FEATURES.payrollSelf} label="Xem lương của mình">
      <PayrollListScreen />
    </PlatformFeatureGate>
  );
}
