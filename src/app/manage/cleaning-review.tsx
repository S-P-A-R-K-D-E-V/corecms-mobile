import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { CleaningReviewScreen } from 'src/features/cleaning/CleaningReviewScreen';

// Vệ sinh theo quyền cleaning.* (Core-be; mặc định Manager / Admin, vai trò tuỳ chỉnh được cấp thêm).
export default function ManageCleaningReview() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.cleaningReview}>
      <CleaningReviewScreen />
    </RoleGuard>
  );
}
