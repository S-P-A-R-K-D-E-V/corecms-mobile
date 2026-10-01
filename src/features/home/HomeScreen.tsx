import { useAuthContext } from 'src/auth/auth-context';
import { usesAdminShell } from 'src/auth/roles';

import { OwnerHome } from './OwnerHome';
import { StaffHome } from './StaffHome';

/** Trang chủ theo shell: chủ cửa hàng (Admin thuần) xem kinh doanh, còn lại xem ca + lương của mình. */
export function HomeScreen() {
  const { user } = useAuthContext();
  return usesAdminShell(user) ? <OwnerHome /> : <StaffHome />;
}
