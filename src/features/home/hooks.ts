import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import dayjs from 'dayjs';

import { getTodayBoard, getMyCurrentEstimate } from 'src/api/home';
import { getRevenueReport, getBreakEvenAnalysis } from 'src/api/reports';
import { getMySchedule } from 'src/api/schedule';
import { getMyAttendanceReport } from 'src/api/attendance';
import { getMyCleaningChecklist } from 'src/api/cleaning';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// Dữ liệu trang chủ. API mới (today-board, my-current-estimate) có thể chưa có trên core-be đang chạy
// → 404: không thử lại, thẻ tương ứng tự ẩn hoặc lùi về dữ liệu cũ.
// ----------------------------------------------------------------------

const MINUTE = 60_000;
const ymd = (d: dayjs.Dayjs) => d.format('YYYY-MM-DD');

function retryUnless404(failureCount: number, error: unknown) {
  const status = (error as any)?.response?.status ?? (error as any)?.status;
  if (status === 404 || status === 403) return false;
  return failureCount < 1;
}

/** Ẩn/hiện số tiền kiểu MB Bank: mặc định ẩn lợi nhuận và lương, giữ trong phiên (không lưu máy). */
type AmountVisibility = { profit: boolean; salary: boolean; toggle: (k: 'profit' | 'salary') => void };
export const useAmountVisibility = create<AmountVisibility>((set) => ({
  profit: false,
  salary: false,
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<AmountVisibility>),
}));

export const HIDDEN_AMOUNT = '••••••';

// ── Chủ cửa hàng ───────────────────────────────────────────────────────

/** Doanh thu + lợi nhuận gộp từ đầu tháng tới hôm nay. */
export function useMonthProfit(enabled = true) {
  const from = ymd(dayjs().startOf('month'));
  const to = ymd(dayjs());
  return useQuery({
    queryKey: ['home', 'month-profit', from, to],
    queryFn: () => getRevenueReport({ fromDate: from, toDate: to, groupBy: 'day' }),
    staleTime: MINUTE,
    enabled,
  });
}

export function useBreakEvenToday(enabled = true) {
  const today = ymd(dayjs());
  return useQuery({
    queryKey: ['home', 'break-even', today],
    queryFn: () => getBreakEvenAnalysis({ period: 'day', targetDate: today }),
    staleTime: MINUTE,
    retry: retryUnless404,
    enabled,
  });
}

export function useTodayBoard(enabled = true) {
  return useQuery({
    queryKey: ['home', 'today-board'],
    queryFn: getTodayBoard,
    staleTime: MINUTE,
    retry: retryUnless404,
    enabled,
  });
}

// ── Nhân viên ──────────────────────────────────────────────────────────

export function useMyEstimate() {
  return useQuery({
    queryKey: ['home', 'my-estimate'],
    queryFn: getMyCurrentEstimate,
    staleTime: MINUTE,
    retry: retryUnless404,
  });
}

/** Kỳ đang xem: theo chu kỳ lương nếu có (lương tạm tính trả về), không thì tháng dương lịch. */
export function usePayPeriod() {
  const estimate = useMyEstimate();
  const from = estimate.data?.fromDate ?? ymd(dayjs().startOf('month'));
  const to = estimate.data?.toDate ?? ymd(dayjs().endOf('month'));
  return { from, to, ready: !estimate.isLoading };
}

/** Lịch trong kỳ (đếm ca được phân) + 14 ngày tới (tìm ca kế tiếp). */
export function usePeriodSchedule(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: ['schedule', 'home-period', from, to],
    queryFn: () => getMySchedule(from, to),
    staleTime: MINUTE,
    enabled,
  });
}

export function useUpcomingSchedule() {
  const from = ymd(dayjs());
  const to = ymd(dayjs().add(14, 'day'));
  return useQuery({
    queryKey: ['schedule', 'home-upcoming', from],
    queryFn: () => getMySchedule(from, to),
    staleTime: MINUTE,
  });
}

/** Chấm công từ đầu kỳ tới hôm nay (đi muộn, về sớm, vắng…). */
export function usePeriodReport(from: string, enabled: boolean) {
  const to = ymd(dayjs());
  return useQuery({
    queryKey: ['attendance', 'home-report', from, to],
    queryFn: () => getMyAttendanceReport(from, to),
    staleTime: MINUTE,
    enabled,
  });
}

export function useTodayCleaning() {
  const today = ymd(dayjs());
  return useQuery({
    // Cùng key với thẻ checklist ở màn điểm danh → dùng chung cache.
    queryKey: ['cleaning', 'my-checklist', today],
    queryFn: () => getMyCleaningChecklist(today),
    staleTime: MINUTE,
  });
}

// ── Định dạng ──────────────────────────────────────────────────────────

/** "Vừa xong" / "12 phút trước" / "3 giờ trước" / "02/10 14:05". */
export function timeAgo(iso: string): string {
  const d = dayjs(iso);
  const mins = dayjs().diff(d, 'minute');
  if (mins < 1) return t('home.justNow');
  if (mins < 60) return t('home.minutesAgo', { n: mins });
  if (mins < 6 * 60) return t('home.hoursAgo', { n: Math.floor(mins / 60) });
  return d.format('DD/MM HH:mm');
}

/** % chênh lệch (làm tròn); null nếu không có mốc so sánh. */
export function percentChange(current: number, previous?: number | null): number | null {
  if (!previous || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
