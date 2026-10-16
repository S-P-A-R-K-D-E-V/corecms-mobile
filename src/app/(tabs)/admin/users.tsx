import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { UsersScreen } from 'src/features/admin-reports/UsersScreen';

export default function AdminUsers() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <UsersScreen />
    </RoleGuard>
  );
}
