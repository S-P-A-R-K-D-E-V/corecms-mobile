import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';
import { UserDetailScreen } from 'src/features/admin-reports/UserDetailScreen';

export default function AdminUserDetail() {
  return (
    <RoleGuard allPermissions={[PERMISSIONS.user.read]}>
      <UserDetailScreen />
    </RoleGuard>
  );
}
