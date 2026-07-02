import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getAllPayrollCycles, createPayrollCycle } from 'src/api/payrollCycle';
import {
  generateBatchPayroll,
  getPayrollByCycle,
  getPayrollShiftDetails,
  recalculatePayrollByCycle,
} from 'src/api/payroll';
import type {
  IBatchPayrollCalculationRequest,
  ICreatePayrollCycleRequest,
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
