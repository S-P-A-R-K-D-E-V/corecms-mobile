import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { WorkTaskReviewScreen } from 'src/features/work/WorkTaskReviewScreen';

// Công việc → chấm việc giao một người (hr.task.manage): Chờ chấm / Đang làm / Đã chấm theo tháng, đổi người. ?id= mở một việc.
export default function WorkCenterTaskReview() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.workTaskReview}>
      <WorkTaskReviewScreen />
    </RoleGuard>
  );
}
