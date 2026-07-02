import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import dayjs from 'dayjs';

import {
  applyAutoAssign,
  bulkAssignShiftSchedule,
  getShiftSchedules,
  getTeamAssignments,
  swapShiftAssignments,
} from 'src/api/schedule';
import { getAllUsers } from 'src/api/users';
import { getAttendanceReport } from 'src/api/reports';
import { getAttendanceRequests, manualAdjustment, processAttendanceRequest } from 'src/api/attendance';
import { getPendingShiftSwapRequests, reviewShiftSwapRequest } from 'src/api/shiftSwap';
import { getPendingLateCoverRequests, reviewLateCoverRequest } from 'src/api/lateCover';
import type {
  IAutoAssignSlotDto,
  IBulkAssignShiftScheduleRequest,
  IManualAttendanceAdjustmentRequest,
  ISwapShiftAssignmentsRequest,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Hooks cho khu "Quản lý" (Manager/Admin): lịch đội ngũ + duyệt yêu cầu.
// ----------------------------------------------------------------------

const MINUTE = 60_000;

/** Ca làm của mọi nhân viên trong khoảng [fromDate, toDate] (yyyy-MM-dd). */
export function useTeamAssignments(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['manage', 'team-assignments', fromDate, toDate],
    queryFn: () => getTeamAssignments(fromDate, toDate),
    staleTime: MINUTE,
  });
}

/** Định nghĩa ca (versioned) áp dụng trong khoảng — nguồn cho màn Xếp ca. */
export function useShiftSchedules(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ['manage', 'shift-schedules', fromDate, toDate],
    queryFn: () => getShiftSchedules(fromDate, toDate),
    staleTime: 5 * MINUTE, // định nghĩa ca ít thay đổi
  });
}

/** Toàn bộ nhân viên (đang hoạt động) — chọn người khi xếp ca. */
export function useAllStaff() {
  return useQuery({
    queryKey: ['manage', 'staff'],
    queryFn: getAllUsers,
    staleTime: 5 * MINUTE,
    select: (users) => users.filter((u) => u.isActive),
  });
}

/** Phân công hàng loạt (auto assign) — invalidate lịch đội ngũ. */
export function useBulkAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IBulkAssignShiftScheduleRequest) => bulkAssignShiftSchedule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage', 'team-assignments'] });
    },
  });
}

/** Điều chỉnh giờ chấm công của nhân viên — invalidate lịch đội ngũ. */
export function useManualAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IManualAttendanceAdjustmentRequest) => manualAdjustment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage', 'team-assignments'] });
    },
  });
}

/** Điểm chuyên cần 30 ngày gần nhất: staffId → (muộn + về sớm). Càng thấp càng tốt. */
export function useStaffPunctuality() {
  const toDate = dayjs().format('YYYY-MM-DD');
  const fromDate = dayjs().subtract(29, 'day').format('YYYY-MM-DD');
  return useQuery({
    queryKey: ['manage', 'punctuality', fromDate, toDate],
    queryFn: () => getAttendanceReport({ fromDate, toDate }),
    staleTime: 5 * MINUTE,
    select: (rows) => {
      const map = new Map<string, number>();
      for (const r of rows) map.set(r.staffId, (r.lateCount ?? 0) + (r.earlyLeaveCount ?? 0));
      return map;
    },
  });
}

/** Áp dụng phân công tự động (auto-assign) — invalidate lịch đội ngũ. */
export function useApplyAutoAssign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (slots: IAutoAssignSlotDto[]) => applyAutoAssign(slots),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manage', 'team-assignments'] }),
  });
}

/** Hoán đổi 2 phân công ca — invalidate lịch đội ngũ. */
export function useSwapShiftAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ISwapShiftAssignmentsRequest) => swapShiftAssignments(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage', 'team-assignments'] });
    },
  });
}

// ── Duyệt yêu cầu ──────────────────────────────────────────────────────

export function usePendingAttendanceRequests() {
  return useQuery({
    queryKey: ['manage', 'attendance-requests', 'pending'],
    queryFn: () => getAttendanceRequests('Pending'),
    staleTime: MINUTE,
  });
}

export function usePendingSwapRequests() {
  return useQuery({
    queryKey: ['manage', 'swap-requests', 'pending'],
    queryFn: getPendingShiftSwapRequests,
    staleTime: MINUTE,
  });
}

export function usePendingLateCoverRequests() {
  return useQuery({
    queryKey: ['manage', 'late-cover', 'pending'],
    queryFn: getPendingLateCoverRequests,
    staleTime: MINUTE,
  });
}

type ReviewInput = { id: string; status: 'Approved' | 'Rejected'; reviewNote?: string };

export function useProcessAttendanceRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reviewNote }: ReviewInput) =>
      processAttendanceRequest(id, { status, reviewNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage', 'attendance-requests'] });
    },
  });
}

export function useReviewSwapRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reviewNote }: ReviewInput) =>
      reviewShiftSwapRequest(id, { status, reviewNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage', 'swap-requests'] });
      // Đổi ca được duyệt làm thay đổi lịch đội ngũ.
      qc.invalidateQueries({ queryKey: ['manage', 'team-assignments'] });
    },
  });
}

export function useReviewLateCoverRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, reviewNote }: ReviewInput) =>
      reviewLateCoverRequest(id, { status, reviewNote }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage', 'late-cover'] });
    },
  });
}

/** Tổng số yêu cầu đang chờ (badge). */
export function usePendingApprovalsCount() {
  const att = usePendingAttendanceRequests();
  const swap = usePendingSwapRequests();
  const cover = usePendingLateCoverRequests();
  return (att.data?.length ?? 0) + (swap.data?.length ?? 0) + (cover.data?.length ?? 0);
}
