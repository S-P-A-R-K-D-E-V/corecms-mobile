import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { WorkCenterScreen } from 'src/features/work-center/WorkCenterScreen';

// Trung tâm việc (T3): agent.approve / hr.task.manage / cleaning.review — có MỘT là vào, mỗi nguồn tải theo quyền riêng.
export default function ManageWorkCenter() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.workCenter}>
      <WorkCenterScreen />
    </RoleGuard>
  );
}
