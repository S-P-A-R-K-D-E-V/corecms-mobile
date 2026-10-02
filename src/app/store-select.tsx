import { StoreSelectScreen } from 'src/features/auth/StoreSelectScreen';
import { PlatformBrandScope } from 'src/theme/BrandScope';

export default function StoreSelect() {
  return (
    <PlatformBrandScope>
      <StoreSelectScreen />
    </PlatformBrandScope>
  );
}
