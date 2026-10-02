import { EmailSignInScreen } from 'src/features/auth/EmailSignInScreen';
import { PlatformBrandScope } from 'src/theme/BrandScope';

export default function EmailSignIn() {
  return (
    <PlatformBrandScope>
      <EmailSignInScreen />
    </PlatformBrandScope>
  );
}
