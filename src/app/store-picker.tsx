import { StorePickerScreen } from 'src/features/auth/StorePickerScreen';
import { PlatformBrandScope } from 'src/theme/BrandScope';

export default function StorePicker() {
  return (
    <PlatformBrandScope>
      <StorePickerScreen />
    </PlatformBrandScope>
  );
}
