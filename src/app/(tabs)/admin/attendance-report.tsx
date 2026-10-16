import { RoleGuard } from 'src/auth/role-guard';
import { ADMIN_ROLES } from 'src/auth/roles';
import { AttendanceReportScreen } from 'src/features/admin-reports/AttendanceReportScreen';

export default function AdminAttendanceReport() {
  return (
    <RoleGuard roles={ADMIN_ROLES}>
      <AttendanceReportScreen />
    </RoleGuard>
  );
}
