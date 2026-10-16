import { Stack } from 'expo-router';
import { RoleGuard } from 'src/auth/role-guard';
import { ANY_REPORT_PERMISSION } from 'src/auth/permissions';

// Stack Quản trị: Admin vào mọi màn; vai trò tuỳ chỉnh có quyền báo cáo (vd "Kế toán", Core-be analytics.*) vào được các
// màn báo cáo. Mỗi màn con tự chặn thêm: báo cáo theo quyền của API nó gọi, còn lại chỉ Admin — kể cả khi deep-link.
export default function AdminLayout() {
  return (
    <RoleGuard permissions={ANY_REPORT_PERMISSION}>
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}
