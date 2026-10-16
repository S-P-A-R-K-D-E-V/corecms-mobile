import { RoleGuard } from 'src/auth/role-guard';
import { PERMISSIONS } from 'src/auth/permissions';
import { AttendanceReportScreen } from 'src/features/admin-reports/AttendanceReportScreen';

export default function AdminAttendanceReport() {
  return (
    <RoleGuard permissions={[PERMISSIONS.attendance.read]}>
      <AttendanceReportScreen />
    </RoleGuard>
  );
}
