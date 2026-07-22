import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { getAttendanceReport, getRevenueReport, getExpenseReport, getBreakEvenAnalysis } from 'src/api/reports';
import { getAllUsers, getUserById, changeUserStatus } from 'src/api/users';
import { getAllRoles, assignRoles } from 'src/api/roles';
import { rangeLastDays } from 'src/features/admin-dashboard/hooks';
import type {
  IAssignRoleRequest,
  IChangeUserStatusRequest,
  IRevenueReport,
  IExpenseReport,
  IBreakEvenAnalysis,
} from 'src/types/corecms-api';

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

export function useUser(id?: string) {
  return useQuery({
    queryKey: ['admin', 'user', id],
    queryFn: () => getUserById(id!),
    enabled: !!id,
    staleTime: MINUTE,
  });
}

export function useRoles() {
  return useQuery({
    queryKey: ['admin', 'roles'],
    queryFn: getAllRoles,
    staleTime: 5 * MINUTE,
  });
}

function invalidateUser(qc: ReturnType<typeof useQueryClient>, userId: string) {
  qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
  qc.invalidateQueries({ queryKey: ['admin', 'users'] });
}

export function useChangeUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IChangeUserStatusRequest }) => changeUserStatus(id, data),
    onSuccess: (_r, { id }) => invalidateUser(qc, id),
  });
}

export function useAssignRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IAssignRoleRequest) => assignRoles(data),
    onSuccess: (_r, data) => invalidateUser(qc, data.userId),
  });
}

// ----------------------------------------------------------------------
// Tổng quan tài chính + điểm hòa vốn (đồng bộ core-fe report-dashboard-view /
// report-breakeven-view). Admin-only, dùng chung /reports/expenses và
// /reports/break-even đã có sẵn ở BE.
// ----------------------------------------------------------------------

export type IFinancialOverview = {
  revenue: IRevenueReport;
  expense: IExpenseReport;
  breakEven: IBreakEvenAnalysis;
  prevRevenue: IRevenueReport;
  prevExpense: IExpenseReport;
};

/** Kỳ trước = khoảng cùng độ dài ngay trước [fromDate, toDate], để so sánh MoM. */
function previousRange(fromDate: string, toDate: string) {
  const lenDays = dayjs(toDate).diff(dayjs(fromDate), 'day');
  const prevTo = dayjs(fromDate).subtract(1, 'day');
  const prevFrom = prevTo.subtract(lenDays, 'day');
  return { fromDate: prevFrom.format('YYYY-MM-DD'), toDate: prevTo.format('YYYY-MM-DD') };
}

export function useFinancialOverview(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['admin', 'financial-overview', fromDate, toDate],
    queryFn: async (): Promise<IFinancialOverview> => {
      const prev = previousRange(fromDate, toDate);
      const [revenue, expense, breakEven, prevRevenue, prevExpense] = await Promise.all([
        getRevenueReport({ fromDate, toDate, groupBy: 'day' }),
        getExpenseReport({ fromDate, toDate, groupBy: 'day' }),
        getBreakEvenAnalysis({ period: 'month', targetDate: toDate }),
        getRevenueReport({ ...prev, groupBy: 'day' }),
        getExpenseReport({ ...prev, groupBy: 'day' }),
      ]);
      return { revenue, expense, breakEven, prevRevenue, prevExpense };
    },
    staleTime: MINUTE,
  });
}

export function useBreakEvenAnalysis(period: 'day' | 'month' | 'year', targetDate: string) {
  return useQuery({
    queryKey: ['admin', 'break-even', period, targetDate],
    queryFn: () => getBreakEvenAnalysis({ period, targetDate }),
    staleTime: MINUTE,
  });
}
