import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { CleaningReviewScreen } from 'src/features/cleaning/CleaningReviewScreen';

// Công việc → chấm việc theo ca của một ca (cleaning.read xem; nút chấm / phạt theo quyền riêng trong màn). ?date=&block=.
export default function WorkCenterShiftReview() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.cleaningReview}>
      <CleaningReviewScreen />
    </RoleGuard>
  );
}
