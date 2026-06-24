import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getShiftCashSummary, getKiotVietDailySummary } from 'src/api/shiftCash';

export function useShiftCash(date: string) {
  const qc = useQueryClient();

  const summaryQ = useQuery({
    queryKey: ['shift-cash', 'summary', date],
    queryFn: () => getShiftCashSummary(date),
  });

  // KiotViet có thể chậm/hỏng → tách query riêng, không chặn phần tổng hợp.
  const kiotQ = useQuery({
    queryKey: ['shift-cash', 'kiot', date],
    queryFn: () => getKiotVietDailySummary(date),
    retry: 1,
  });

  return {
    summary: summaryQ.data ?? null,
    kiot: kiotQ.data ?? null,
    loading: summaryQ.isLoading,
    kiotLoading: kiotQ.isLoading,
    kiotError: kiotQ.isError,
    refreshing: summaryQ.isFetching || kiotQ.isFetching,
    error: summaryQ.isError,
    refetch: () =>
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'shift-cash' }),
  };
}
