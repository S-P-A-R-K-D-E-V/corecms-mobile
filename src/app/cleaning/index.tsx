import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { CleaningChecklistScreen } from 'src/features/cleaning/CleaningChecklistScreen';

export default function Cleaning() {
  return (
    <InternalAppGuard>
      <CleaningChecklistScreen />
    </InternalAppGuard>
  );
}
