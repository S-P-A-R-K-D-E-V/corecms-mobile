import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { formatCompact, formatMoney } from 'src/i18n/format';
import {
  getDashboardSummary,
  getRevenueReport,
  getPaymentMethodReport,
  getAttendanceReport,
} from 'src/api/reports';
import { PLATFORM_FEATURES } from 'src/auth/platform-features';
import { usePlatformFeatureAllowed } from 'src/auth/use-platform-feature';

// ----------------------------------------------------------------------
// Hooks React Query cho dashboard Quản trị. staleTime 60s để tránh gọi lại
// liên tục khi chuyển tab; refetch bằng pull-to-refresh trên màn hình. Chủ cửa hàng tắt xem báo cáo trên app với người
// này → không gọi /reports/* (thẻ doanh thu ở trang chủ tự ẩn).
// ----------------------------------------------------------------------

const MINUTE = 60_000;

/** ISO date (yyyy-MM-dd) của hôm nay và N ngày trước — dùng cho khoảng báo cáo. */
export function rangeLastDays(days: number) {
  const toDate = dayjs().format('YYYY-MM-DD');
  const fromDate = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
  return { fromDate, toDate };
}

export function useDashboardSummary() {
  const enabled = usePlatformFeatureAllowed(PLATFORM_FEATURES.reports);
  return useQuery({
    queryKey: ['admin', 'dashboard-summary'],
    queryFn: getDashboardSummary,
    staleTime: MINUTE,
    enabled,
  });
}

export function useRevenueReport(days: number) {
  const range = rangeLastDays(days);
  const enabled = usePlatformFeatureAllowed(PLATFORM_FEATURES.reports);
  return useQuery({
    queryKey: ['admin', 'revenue', days],
    queryFn: () => getRevenueReport({ ...range, groupBy: 'day' }),
    staleTime: MINUTE,
    enabled,
  });
}

export function usePaymentMix(days: number) {
  const range = rangeLastDays(days);
  const enabled = usePlatformFeatureAllowed(PLATFORM_FEATURES.reports);
  return useQuery({
    queryKey: ['admin', 'payment-mix', days],
    queryFn: () => getPaymentMethodReport(range),
    staleTime: MINUTE,
    enabled,
  });
}

/** Báo cáo chấm công của ngày hôm nay — tổng hợp có mặt / muộn / vắng. */
export function useTodayAttendance() {
  const today = dayjs().format('YYYY-MM-DD');
  return useQuery({
    queryKey: ['admin', 'attendance-today', today],
    queryFn: () => getAttendanceReport({ fromDate: today, toDate: today }),
    staleTime: MINUTE,
  });
}

// ----------------------------------------------------------------------

/** Rút gọn số tiền lớn: 1.2Tr / 950K / 500 (theo ngôn ngữ — xem src/i18n/format). */
export function fmtCompact(v?: number): string {
  return formatCompact(v);
}

/** Số tiền theo đơn vị tiền tệ của cửa hàng. */
export function fmtMoney(v?: number): string {
  return formatMoney(v);
}
