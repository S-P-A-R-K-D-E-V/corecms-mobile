import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { CleaningTaskLibraryScreen } from 'src/features/cleaning/CleaningTaskLibraryScreen';

// Vệ sinh theo quyền cleaning.* (Core-be; mặc định Manager / Admin, vai trò tuỳ chỉnh được cấp thêm).
export default function ManageCleaningTasks() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.cleaningTemplates}>
      <CleaningTaskLibraryScreen />
    </RoleGuard>
  );
}
