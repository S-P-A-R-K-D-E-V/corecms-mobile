import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { CleaningWeekBuilderScreen } from 'src/features/cleaning/CleaningWeekBuilderScreen';

// Vệ sinh theo quyền cleaning.* (Core-be; mặc định Manager / Admin, vai trò tuỳ chỉnh được cấp thêm).
export default function ManageCleaningBuilder() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.cleaningTemplates}>
      <CleaningWeekBuilderScreen />
    </RoleGuard>
  );
}
