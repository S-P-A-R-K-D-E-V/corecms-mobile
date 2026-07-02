import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import {
  getDashboardSummary,
  getRevenueReport,
  getPaymentMethodReport,
  getAttendanceReport,
} from 'src/api/reports';

// ----------------------------------------------------------------------
// Hooks React Query cho dashboard Quản trị. staleTime 60s để tránh gọi lại
// liên tục khi chuyển tab; refetch bằng pull-to-refresh trên màn hình.
// ----------------------------------------------------------------------

const MINUTE = 60_000;

/** ISO date (yyyy-MM-dd) của hôm nay và N ngày trước — dùng cho khoảng báo cáo. */
export function rangeLastDays(days: number) {
  const toDate = dayjs().format('YYYY-MM-DD');
  const fromDate = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
  return { fromDate, toDate };
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ['admin', 'dashboard-summary'],
    queryFn: getDashboardSummary,
    staleTime: MINUTE,
  });
}

export function useRevenueReport(days: number) {
  const range = rangeLastDays(days);
  return useQuery({
    queryKey: ['admin', 'revenue', days],
    queryFn: () => getRevenueReport({ ...range, groupBy: 'day' }),
    staleTime: MINUTE,
  });
}

export function usePaymentMix(days: number) {
  const range = rangeLastDays(days);
  return useQuery({
    queryKey: ['admin', 'payment-mix', days],
    queryFn: () => getPaymentMethodReport(range),
    staleTime: MINUTE,
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

/** Rút gọn số tiền lớn: 1.2Tr / 950K / 500. */
export function fmtCompact(v?: number): string {
  const n = v ?? 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}Tr`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export function fmtMoney(v?: number): string {
  return v != null ? `${v.toLocaleString('vi-VN')}đ` : '0đ';
}
