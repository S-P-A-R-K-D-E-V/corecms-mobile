import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { CoverSwapScreen } from 'src/features/manage/CoverSwapScreen';

export default function ManageCover() {
  return (
    <RoleGuard allPermissions={MANAGE_SCREEN_PERMISSIONS.coverShift}>
      <CoverSwapScreen />
    </RoleGuard>
  );
}
