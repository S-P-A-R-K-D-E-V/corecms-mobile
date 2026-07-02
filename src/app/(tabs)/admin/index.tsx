import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { AdminDashboardScreen } from 'src/features/admin-dashboard/AdminDashboardScreen';

export default function Admin() {
  // Chỉ Manager/Admin xem được — hiện 403 cho vai trò khác dù có deep-link.
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <AdminDashboardScreen />
    </RoleGuard>
  );
}
