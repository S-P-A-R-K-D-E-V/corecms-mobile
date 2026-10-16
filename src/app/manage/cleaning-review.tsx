import { RoleGuard } from 'src/auth/role-guard';
import { MANAGER_ROLES } from 'src/auth/roles';
import { CleaningReviewScreen } from 'src/features/cleaning/CleaningReviewScreen';

// Vệ sinh chưa chuyển sang quyền: chỉ Manager / Admin (stack Quản lý giờ mở cho cả vai trò có quyền ca làm).
export default function ManageCleaningReview() {
  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <CleaningReviewScreen />
    </RoleGuard>
  );
}
