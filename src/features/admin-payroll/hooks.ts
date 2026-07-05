import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAllPayrollCycles, createPayrollCycle, setPayrollCycleVisibility } from 'src/api/payrollCycle';
import {
  bulkFinalizePayroll,
  finalizePayroll,
  generateBatchPayroll,
  getPayrollByCycle,
  getPayrollPayment,
  getPayrollShiftDetails,
  getSalaryConfigPreview,
  markPayrollPaid,
  preparePayrollPayment,
  recalculatePayrollByCycle,
  recalculatePayrollRecord,
  removeWaiver,
  waivePenalty,
} from 'src/api/payroll';
import { getUserSalaryConfigs, versionedUpsertSalaryConfig } from 'src/api/salary';
import type {
  IBatchPayrollCalculationRequest,
  IBulkFinalizePayrollRequest,
  ICreatePayrollCycleRequest,
  IFinalizePayrollRequest,
  IMarkPayrollPaidRequest,
  IVersionedUpsertSalaryConfigRequest,
  IWaivePenaltyRequest,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Hooks chu kỳ lương + tính lương (Admin). Sau khi tạo/tính xong invalidate
// danh sách chu kỳ và bảng lương theo cycle để UI cập nhật ngay.
// ----------------------------------------------------------------------

const MINUTE = 60_000;

export function usePayrollCycles() {
  return useQuery({
    queryKey: ['admin', 'payroll-cycles'],
    queryFn: getAllPayrollCycles,
    staleTime: MINUTE,
  });
}

export function usePayrollByCycle(cycleId?: string) {
  return useQuery({
    queryKey: ['admin', 'payroll-by-cycle', cycleId],
    queryFn: () => getPayrollByCycle(cycleId!),
    enabled: !!cycleId,
    staleTime: MINUTE,
  });
}

/** Chi tiết từng ca trong 1 bảng lương (1 nhân viên). */
export function usePayrollShiftDetails(recordId?: string) {
  return useQuery({
    queryKey: ['admin', 'payroll-shift-details', recordId],
    queryFn: () => getPayrollShiftDetails(recordId!),
    enabled: !!recordId,
    staleTime: MINUTE,
  });
}

export function useCreatePayrollCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ICreatePayrollCycleRequest) => createPayrollCycle(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payroll-cycles'] }),
  });
}

/** Tạo chu kỳ + tính lương hàng loạt trong 1 bước. */
export function useGenerateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IBatchPayrollCalculationRequest) => generateBatchPayroll(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payroll-cycles'] }),
  });
}

/** Tính lại toàn bộ bảng lương của 1 chu kỳ. */
export function useRecalculateCycle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cycleId: string) => recalculatePayrollByCycle(cycleId),
    onSuccess: (_res, cycleId) => {
      qc.invalidateQueries({ queryKey: ['admin', 'payroll-by-cycle', cycleId] });
      qc.invalidateQueries({ queryKey: ['admin', 'payroll-cycles'] });
    },
  });
}

/** [Admin] Bật/tắt hiển thị chu kỳ cho nhân viên. */
export function useSetCycleVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cycleId, isVisibleToStaff }: { cycleId: string; isVisibleToStaff: boolean }) =>
      setPayrollCycleVisibility(cycleId, isVisibleToStaff),
    onSuccess: (_res, { cycleId }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'payroll-by-cycle', cycleId] });
      qc.invalidateQueries({ queryKey: ['admin', 'payroll-cycles'] });
    },
  });
}

// ── Cấu hình lương cá nhân ─────────────────────────────────────────────

export function useUserSalaryConfigs(userId?: string) {
  return useQuery({
    queryKey: ['admin', 'salary-configs', userId],
    queryFn: () => getUserSalaryConfigs(userId!),
    enabled: !!userId,
    staleTime: MINUTE,
  });
}

export function useUpsertSalaryConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IVersionedUpsertSalaryConfigRequest) => versionedUpsertSalaryConfig(data),
    onSuccess: (_r, data) => qc.invalidateQueries({ queryKey: ['admin', 'salary-configs', data.userId] }),
  });
}

// ── Tính lại 1 bảng + chốt lương ───────────────────────────────────────

function invalidatePayroll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['admin', 'payroll-by-cycle'] });
  qc.invalidateQueries({ queryKey: ['admin', 'payroll-shift-details'] });
  qc.invalidateQueries({ queryKey: ['admin', 'payroll-cycles'] });
}

/** Tính lại lương 1 nhân viên (sau khi đổi cấu hình lương). */
export function useRecalculateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recordId: string) => recalculatePayrollRecord(recordId),
    onSuccess: () => invalidatePayroll(qc),
  });
}

// ── Bỏ qua lỗi vi phạm (waive penalty) ─────────────────────────────────

/** Bỏ qua lỗi 1 ca — invalidate chi tiết ca để hiện trạng thái "Đã bỏ qua lỗi".
 *  (Số tiền phạt chỉ được trừ sau khi "Tính lại lương".) */
export function useWaivePenalty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IWaivePenaltyRequest) => waivePenalty(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payroll-shift-details'] }),
  });
}

/** Huỷ bỏ-qua-lỗi theo waiverId. */
export function useRemoveWaiver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (waiverId: string) => removeWaiver(waiverId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'payroll-shift-details'] }),
  });
}

/** Chốt / bỏ chốt 1 bảng lương. */
export function useFinalizePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IFinalizePayrollRequest }) => finalizePayroll(id, data),
    onSuccess: () => invalidatePayroll(qc),
  });
}

/** Chốt / bỏ chốt hàng loạt. */
export function useBulkFinalize() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: IBulkFinalizePayrollRequest) => bulkFinalizePayroll(data),
    onSuccess: () => invalidatePayroll(qc),
  });
}

// ── Preview cấu hình + tính lại theo danh sách (loop) ──────────────────

export function useSalaryConfigPreview(fromDate?: string) {
  return useQuery({
    queryKey: ['admin', 'salary-config-preview', fromDate],
    queryFn: () => getSalaryConfigPreview(fromDate!),
    enabled: !!fromDate,
    staleTime: MINUTE,
  });
}

/**
 * Tính lại lương cho DANH SÁCH record (tuần tự) — dùng cho "tính lại toàn bộ
 * chỉ NV chưa chốt" (truyền các recordId chưa chốt) và tính lại 1 NV.
 */
export function useRecalculateMany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (recordIds: string[]) => {
      let success = 0;
      let failed = 0;
      for (const id of recordIds) {
        try { await recalculatePayrollRecord(id); success += 1; } catch { failed += 1; }
      }
      return { success, failed };
    },
    onSuccess: () => invalidatePayroll(qc),
  });
}

// ── Thanh toán lương ───────────────────────────────────────────────────

export function usePayrollPayment(recordId?: string) {
  return useQuery({
    queryKey: ['admin', 'payroll-payment', recordId],
    queryFn: () => getPayrollPayment(recordId!),
    enabled: !!recordId,
    staleTime: MINUTE,
  });
}

export function usePreparePayment() {
  return useMutation({ mutationFn: (recordId: string) => preparePayrollPayment(recordId) });
}

export function useMarkPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: IMarkPayrollPaidRequest }) => markPayrollPaid(id, data),
    onSuccess: (_r, { id }) => {
      qc.invalidateQueries({ queryKey: ['admin', 'payroll-payment', id] });
      invalidatePayroll(qc);
    },
  });
}
