import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';
import { UsersScreen } from 'src/features/admin-reports/UsersScreen';

export default function AdminUsers() {
  return (
    <RoleGuard allPermissions={[PERMISSIONS.user.read]}>
      <UsersScreen />
    </RoleGuard>
  );
}
