import { Stack } from 'expo-router';
import { RoleGuard } from 'src/auth/role-guard';
import { ANY_REPORT_PERMISSION, PERMISSIONS } from 'src/auth/permissions';

// Stack Quản trị: Admin vào mọi màn; người có quyền báo cáo (analytics.*), xem bảng lương (payroll.records.read) hoặc báo
// cáo công (attendance.read) — Manager mặc định, vai trò tuỳ chỉnh được cấp — vào được các màn tương ứng. Mỗi màn con tự chặn thêm theo quyền của API
// nó gọi, màn còn lại chỉ Admin — kể cả khi deep-link.
const ADMIN_STACK_PERMISSIONS: readonly string[] = [
  ...ANY_REPORT_PERMISSION,
  PERMISSIONS.payroll.recordsRead,
  PERMISSIONS.attendance.read,
];

export default function AdminLayout() {
  return (
    <RoleGuard permissions={ADMIN_STACK_PERMISSIONS}>
      <Stack screenOptions={{ headerShown: false }} />
    </RoleGuard>
  );
}
