import { WelcomeScreen } from 'src/features/auth/WelcomeScreen';
import { PlatformBrandScope } from 'src/theme/BrandScope';

export default function Welcome() {
  return (
    <PlatformBrandScope>
      <WelcomeScreen />
    </PlatformBrandScope>
  );
}
