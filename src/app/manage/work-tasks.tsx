import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { WorkTaskReviewScreen } from 'src/features/work/WorkTaskReviewScreen';

// Chấm việc giao riêng theo quyền hr.task.manage (Core-be; mặc định Manager / Admin).
export default function ManageWorkTasks() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.workTaskReview}>
      <WorkTaskReviewScreen />
    </RoleGuard>
  );
}
