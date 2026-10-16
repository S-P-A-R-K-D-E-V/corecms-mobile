import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { AdminDashboardScreen } from 'src/features/admin-dashboard/AdminDashboardScreen';

export default function Admin() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <AdminDashboardScreen />
    </RoleGuard>
  );
}
