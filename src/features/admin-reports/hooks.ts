import { useQuery } from '@tanstack/react-query';

import { getAttendanceReport } from 'src/api/reports';
import { getAllUsers } from 'src/api/users';
import { rangeLastDays } from 'src/features/admin-dashboard/hooks';

// ----------------------------------------------------------------------
// Hooks cho các màn báo cáo Admin (doanh thu tái dùng hooks admin-dashboard).
// ----------------------------------------------------------------------

const MINUTE = 60_000;

/** Báo cáo chấm công gộp theo nhân viên trong N ngày gần nhất. */
export function useAttendanceReport(days: number) {
  const range = rangeLastDays(days);
  return useQuery({
    queryKey: ['admin', 'attendance-report', days],
    queryFn: () => getAttendanceReport(range),
    staleTime: MINUTE,
  });
}

/** Toàn bộ người dùng (gồm cả ngừng hoạt động) — màn quản lý người dùng. */
export function useUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: getAllUsers,
    staleTime: 5 * MINUTE,
  });
}
