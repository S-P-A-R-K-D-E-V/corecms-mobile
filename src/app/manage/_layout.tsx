import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { RoleGuard } from 'src/auth/role-guard';
import { MANAGER_ROLES } from 'src/auth/roles';

// Khu "Quản lý" — chỉ Manager/Admin. Guard ở layout nên mọi màn con
// (schedule, approvals, ...) đều được bảo vệ kể cả khi deep-link.
export default function ManageLayout() {
  return (
    <InternalAppGuard>
      <RoleGuard roles={MANAGER_ROLES}>
        <Stack screenOptions={{ headerShown: false }} />
      </RoleGuard>
    </InternalAppGuard>
  );
}
