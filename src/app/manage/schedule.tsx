import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { TeamScheduleScreen } from 'src/features/manage/TeamScheduleScreen';

export default function ManageSchedule() {
  return (
    <RoleGuard allPermissions={MANAGE_SCREEN_PERMISSIONS.teamSchedule}>
      <TeamScheduleScreen />
    </RoleGuard>
  );
}
