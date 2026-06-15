import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { getMyAttendanceLogs, getMyAttendanceReport } from 'src/api/attendance';
import { getMySchedule } from 'src/api/schedule';
import type { IAttendanceLog } from 'src/types/corecms-api';

const today = () => dayjs().format('YYYY-MM-DD');
const monthStart = () => dayjs().startOf('month').format('YYYY-MM-DD');

/** Active (open) attendance log = checked-in but not yet checked-out. */
function findActiveLog(logs: IAttendanceLog[]): IAttendanceLog | null {
  return (
    logs.find((l) => l.status === 'CheckedIn') ??
    logs.find((l) => !!l.checkInTime && !l.checkOutTime) ??
    null
  );
}

export function useCheckinData() {
  const qc = useQueryClient();

  const logsQ = useQuery({
    queryKey: ['attendance', 'logs', 'today'],
    queryFn: () => getMyAttendanceLogs(today(), today()),
  });
  const shiftsQ = useQuery({
    queryKey: ['schedule', 'today'],
    queryFn: () => getMySchedule(today(), today()),
  });
  const reportQ = useQuery({
    queryKey: ['attendance', 'report', 'month'],
    queryFn: () => getMyAttendanceReport(monthStart(), today()),
  });

  const logs = logsQ.data ?? [];

  return {
    logs,
    shifts: shiftsQ.data ?? [],
    report: reportQ.data ?? null,
    activeLog: findActiveLog(logs),
    loading: logsQ.isLoading || shiftsQ.isLoading,
    refreshing: logsQ.isFetching || shiftsQ.isFetching || reportQ.isFetching,
    refetch: () =>
      qc.invalidateQueries({
        predicate: (q) =>
          ['attendance', 'schedule'].includes(q.queryKey[0] as string),
      }),
  };
}
