import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAttendanceReport } from 'src/api/reports';
import { getAllUsers, getUserById, changeUserStatus } from 'src/api/users';
import { getAllRoles, assignRoles } from 'src/api/roles';
import { rangeLastDays } from 'src/features/admin-dashboard/hooks';
import type { IAssignRoleRequest, IChangeUserStatusRequest } from 'src/types/corecms-api';

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
