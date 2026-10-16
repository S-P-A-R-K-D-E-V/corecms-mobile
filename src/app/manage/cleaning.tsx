import { RoleGuard } from 'src/auth/role-guard';
import { MANAGER_ROLES } from 'src/auth/roles';
import { CleaningWeekOverviewScreen } from 'src/features/cleaning/CleaningWeekOverviewScreen';

// Vệ sinh chưa chuyển sang quyền: chỉ Manager / Admin (stack Quản lý giờ mở cho cả vai trò có quyền ca làm).
export default function ManageCleaning() {
  return (
    <RoleGuard roles={MANAGER_ROLES}>
      <CleaningWeekOverviewScreen />
    </RoleGuard>
  );
}
