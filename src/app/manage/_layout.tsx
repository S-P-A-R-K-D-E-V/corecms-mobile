import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';

// Khu "Quản lý": người có quyền ca làm / chấm công / vệ sinh (Manager, Admin mặc định; vai trò tuỳ chỉnh được cấp — vd
// Trưởng ca). Guard ở layout nên mọi màn con đều được bảo vệ kể cả khi deep-link; mỗi màn tự chặn thêm theo quyền của API
// nó gọi.
const MANAGE_STACK_PERMISSIONS: readonly string[] = Array.from(
  new Set(Object.values(MANAGE_SCREEN_PERMISSIONS).flat())
);

export default function ManageLayout() {
  return (
    <InternalAppGuard>
      <RoleGuard permissions={MANAGE_STACK_PERMISSIONS}>
        <Stack screenOptions={{ headerShown: false }} />
      </RoleGuard>
    </InternalAppGuard>
  );
}
