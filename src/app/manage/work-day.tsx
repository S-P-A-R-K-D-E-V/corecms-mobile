import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { WorkDayScreen } from 'src/features/work/WorkDayScreen';

// Việc theo ngày: xem như GET /work-today; đánh dấu xong / gỡ theo quyền của từng loại việc (kiểm trong màn).
export default function ManageWorkDay() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.workDay}>
      <WorkDayScreen />
    </RoleGuard>
  );
}
