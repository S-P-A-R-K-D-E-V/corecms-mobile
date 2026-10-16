import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { ApprovalsScreen } from 'src/features/manage/ApprovalsScreen';

export default function ManageApprovals() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.approvals}>
      <ApprovalsScreen />
    </RoleGuard>
  );
}
