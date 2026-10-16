import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { AssignShiftScreen } from 'src/features/manage/AssignShiftScreen';

export default function ManageAssign() {
  return (
    <RoleGuard allPermissions={MANAGE_SCREEN_PERMISSIONS.assignShift}>
      <AssignShiftScreen />
    </RoleGuard>
  );
}
