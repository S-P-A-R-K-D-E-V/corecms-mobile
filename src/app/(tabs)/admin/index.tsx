import { AdminDashboardScreen } from 'src/features/admin-dashboard/AdminDashboardScreen';

// Guard ADMIN_ROLES đặt ở (tabs)/admin/_layout — bao mọi màn con.
export default function Admin() {
  return <AdminDashboardScreen />;
}
