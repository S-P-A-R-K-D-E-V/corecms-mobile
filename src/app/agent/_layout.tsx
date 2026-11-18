import { Stack } from 'expo-router';
import { InternalAppGuard } from 'src/auth/internal-app-guard';
import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';

// Đội agent (K3): duyệt phiếu agent xin làm lệnh ghi — quyền agent.approve (Admin có sẵn). Guard ở layout nên mở thẳng từ
// thông báo (deep-link) cũng bị chặn khi thiếu quyền.
export default function AgentLayout() {
  return (
    <InternalAppGuard>
      <RoleGuard permissions={[PERMISSIONS.agent.approve]}>
        <Stack screenOptions={{ headerShown: false }} />
      </RoleGuard>
    </InternalAppGuard>
  );
}
