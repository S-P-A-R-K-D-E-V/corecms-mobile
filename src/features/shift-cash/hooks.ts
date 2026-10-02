import { useQuery, useQueryClient } from '@tanstack/react-query';

import { getShiftCashSummary, getKiotVietDailySummary } from 'src/api/shiftCash';
import type { IShiftCashGeoStamp } from 'src/types/corecms-api';

import { getShiftCashDenial } from './access';

// BE từ chối theo luật kiểm quầy (403 ShiftCash.*) thì thử lại vô ích — báo ngay để cổng xử lý.
const retryUnlessDenied = (failureCount: number, err: unknown) => !getShiftCashDenial(err) && failureCount < 1;

/** Số liệu kiểm quầy theo ngày. `geo` = toạ độ đã xác minh ở cổng, gửi kèm header X-Geo-* (Admin: null). */
export function useShiftCash(date: string, geo: IShiftCashGeoStamp | null) {
  const qc = useQueryClient();

  // geo không nằm trong queryKey: toạ độ đổi (lấy lại khi mở lại app) không cần tải lại số liệu;
  // lần tải sau tự dùng toạ độ mới nhất.
  const summaryQ = useQuery({
    queryKey: ['shift-cash', 'summary', date],
    queryFn: () => getShiftCashSummary(date, geo),
    retry: retryUnlessDenied,
  });

  // KiotViet có thể chậm/hỏng → tách query riêng, không chặn phần tổng hợp.
  const kiotQ = useQuery({
    queryKey: ['shift-cash', 'kiot', date],
    queryFn: () => getKiotVietDailySummary(date, geo),
    retry: retryUnlessDenied,
  });

  // Lỗi 403 ShiftCash.* (đã tải xong, không phải lỗi cũ đang tải lại) → màn đưa về cổng.
  const denied =
    [summaryQ, kiotQ].find((q) => q.isError && !q.isFetching && getShiftCashDenial(q.error))?.error ?? null;

  return {
    summary: summaryQ.data ?? null,
    kiot: kiotQ.data ?? null,
    loading: summaryQ.isLoading,
    kiotLoading: kiotQ.isLoading,
    kiotError: kiotQ.isError,
    refreshing: summaryQ.isFetching || kiotQ.isFetching,
    error: summaryQ.isError,
    denied,
    // Làm mới cả ca hôm nay của cổng (khoá 'shift-cash', 'my-shift') — hết ca/đổi ca thì cổng chặn lại.
    refetch: () =>
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'shift-cash' }),
  };
}
