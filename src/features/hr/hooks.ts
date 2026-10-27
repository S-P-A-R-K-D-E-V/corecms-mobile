import { useQuery } from '@tanstack/react-query';

import { getMyHrRecords, getMyShiftLeaves, getMyWorkTasks, getPolicyDocuments } from 'src/api/hr';

/** Việc nhân sự đang chờ mình: văn bản chưa xác nhận, biên bản chờ ký, nhiệm vụ cần nộp, đơn nghỉ chờ duyệt. */
export function useHrPendingCounts(enabled = true) {
  const policies = useQuery({ queryKey: ['hr', 'policies', 'pending'], queryFn: () => getPolicyDocuments(true), enabled, staleTime: 60_000 });
  const records = useQuery({ queryKey: ['hr', 'records'], queryFn: getMyHrRecords, enabled, staleTime: 60_000 });
  const tasks = useQuery({ queryKey: ['hr', 'tasks'], queryFn: () => getMyWorkTasks(), enabled, staleTime: 60_000 });
  const leaves = useQuery({ queryKey: ['hr', 'leave'], queryFn: getMyShiftLeaves, enabled, staleTime: 60_000 });
  return {
    policies: policies.data?.length ?? 0,
    records: (records.data ?? []).filter((r) => r.status === 'AwaitingSignature').length,
    tasks: (tasks.data ?? []).filter((t) => t.status === 'Assigned' || t.status === 'Rejected').length,
    leaves: (leaves.data ?? []).filter((l) => l.status === 'Pending').length,
    refetch: () => Promise.all([policies.refetch(), records.refetch(), tasks.refetch(), leaves.refetch()]),
    isFetching: policies.isFetching || records.isFetching || tasks.isFetching || leaves.isFetching,
  };
}
