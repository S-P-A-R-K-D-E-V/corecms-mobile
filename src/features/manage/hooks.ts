import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getShiftSchedules,
  getTeamAssignments,
  manageShiftAssignments,
  swapShiftAssignments,
} from 'src/api/schedule';
import { getAllUsers } from 'src/api/users';
import { getAttendanceRequests, processAttendanceRequest } from 'src/api/attendance';
import { getPendingShiftSwapRequests, reviewShiftSwapRequest } from 'src/api/shiftSwap';
import { getPendingLateCoverRequests, reviewLateCoverRequest } from 'src/api/lateCover';
import type { IManageShiftAssignmentsRequest, ISwapShiftAssignmentsRequest } from 'src/types/corecms-api';

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

/** Đặt danh sách nhân viên cho (ca, ngày) — invalidate lịch đội ngũ. */
export function useManageShiftAssignments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IManageShiftAssignmentsRequest) => manageShiftAssignments(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manage', 'team-assignments'] });
    },
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
