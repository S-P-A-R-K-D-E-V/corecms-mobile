import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { CleaningChecklistScreen } from 'src/features/cleaning/CleaningChecklistScreen';
import { PlatformFeatureGate } from 'src/auth/platform-feature-gate';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';

export default function Cleaning() {
  return (
    <InternalAppGuard>
      <PlatformFeatureGate feature={PLATFORM_FEATURES.cleaningTasks} label="Làm việc vệ sinh">
        <CleaningChecklistScreen />
      </PlatformFeatureGate>
    </InternalAppGuard>
  );
}
