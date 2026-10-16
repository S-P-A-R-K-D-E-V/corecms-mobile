import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { UserDetailScreen } from 'src/features/admin-reports/UserDetailScreen';

export default function AdminUserDetail() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <UserDetailScreen />
    </RoleGuard>
  );
}
