import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { CleaningWeekOverviewScreen } from 'src/features/cleaning/CleaningWeekOverviewScreen';

// Vệ sinh theo quyền cleaning.* (Core-be; mặc định Manager / Admin, vai trò tuỳ chỉnh được cấp thêm).
export default function ManageCleaning() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.cleaningReview}>
      <CleaningWeekOverviewScreen />
    </RoleGuard>
  );
}
