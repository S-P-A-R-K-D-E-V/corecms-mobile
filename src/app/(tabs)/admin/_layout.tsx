import { Stack } from 'expo-router';
import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';

// Toàn bộ stack Quản trị (Dashboard + báo cáo con) chỉ dành cho Admin.
// Guard ở layout nên mọi màn con (revenue, attendance-report, users) đều được
// bảo vệ, kể cả khi deep-link hoặc điều hướng từ grid của Admin-kiêm-ca.
export default function AdminLayout() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}
