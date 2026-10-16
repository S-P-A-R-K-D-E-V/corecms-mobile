import { RoleGuard } from 'src/auth/role-guard';
import { MANAGER_ROLES } from 'src/auth/roles';
import { CleaningTaskLibraryScreen } from 'src/features/cleaning/CleaningTaskLibraryScreen';

// Vệ sinh chưa chuyển sang quyền: chỉ Manager / Admin (stack Quản lý giờ mở cho cả vai trò có quyền ca làm).
export default function ManageCleaningTasks() {
  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <CleaningTaskLibraryScreen />
    </RoleGuard>
  );
}
