import { RoleGuard } from 'src/auth/role-guard';
import { MANAGE_SCREEN_PERMISSIONS } from 'src/auth/permissions';
import { WorkCenterScreen } from 'src/features/work-center/WorkCenterScreen';

// Công việc (Bảng việc / Lịch tuần / Giao việc): có MỘT quyền xem / giao / chấm việc là vào; mỗi tab, mỗi nguồn theo quyền riêng.
// ?tab=board|schedule|assign, ?source=agent|schedule|assigned|inspection.
export default function ManageWorkCenter() {
  return (
    <RoleGuard permissions={MANAGE_SCREEN_PERMISSIONS.workCenter}>
      <WorkCenterScreen />
    </RoleGuard>
  );
}
