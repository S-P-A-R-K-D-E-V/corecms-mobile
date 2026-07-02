import axios, { endpoints } from './axios';
import type {
  IBatchPayrollCalculationRequest,
  IBatchPayrollResponse,
  IBulkFinalizePayrollRequest,
  IBulkFinalizePayrollResponse,
  IFinalizePayrollRequest,
  IPayrollCalculationRequest,
  IPayrollCycleDetailResponse,
  IPayrollRecord,
  IPayrollShiftDetailResponse,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export async function getMyPayroll(): Promise<IPayrollRecord[]> {
  const response = await axios.get<IPayrollRecord[]>(endpoints.payroll.myPayroll);
  return response.data;
}

export async function getPayrollShiftDetails(payrollRecordId: string): Promise<IPayrollShiftDetailResponse> {
  const response = await axios.get<IPayrollShiftDetailResponse>(
    endpoints.payroll.shiftDetails(payrollRecordId)
  );
  return response.data;
}

// ── Admin: tính lương ──────────────────────────────────────────────────

/** [Admin] Tính lương 1 nhân viên trong khoảng. */
export async function calculatePayroll(data: IPayrollCalculationRequest): Promise<IPayrollRecord> {
  const response = await axios.post<IPayrollRecord>(endpoints.payroll.calculate, data);
  return response.data;
}

/** [Admin] Tạo bảng lương hàng loạt: tạo chu kỳ + tính mọi nhân viên. */
export async function generateBatchPayroll(
  data: IBatchPayrollCalculationRequest
): Promise<IBatchPayrollResponse> {
  const response = await axios.post<IBatchPayrollResponse>(endpoints.payroll.generateBatch, data);
  return response.data;
}

/** [Admin/Manager] Bảng lương của 1 chu kỳ (danh sách theo nhân viên). */
export async function getPayrollByCycle(cycleId: string): Promise<IPayrollCycleDetailResponse> {
  const response = await axios.get<IPayrollCycleDetailResponse>(endpoints.payroll.byCycle(cycleId));
  return response.data;
}

/** [Admin] Tính lại toàn bộ bảng lương trong 1 chu kỳ đã tồn tại. */
export async function recalculatePayrollByCycle(cycleId: string): Promise<IBatchPayrollResponse> {
  const response = await axios.post<IBatchPayrollResponse>(endpoints.payroll.recalculateCycle(cycleId));
  return response.data;
}

/** [Admin] Tính lại lương 1 bảng lương (1 nhân viên) → về trạng thái chờ duyệt. */
export async function recalculatePayrollRecord(id: string): Promise<IPayrollRecord> {
  const response = await axios.post<IPayrollRecord>(endpoints.payroll.recalculateRecord(id));
  return response.data;
}

/** [Admin] Chốt / bỏ chốt 1 bảng lương. */
export async function finalizePayroll(id: string, data: IFinalizePayrollRequest): Promise<IPayrollRecord> {
  const response = await axios.put<IPayrollRecord>(endpoints.payroll.finalize(id), data);
  return response.data;
}

/** [Admin] Chốt / bỏ chốt hàng loạt bảng lương. */
export async function bulkFinalizePayroll(
  data: IBulkFinalizePayrollRequest
): Promise<IBulkFinalizePayrollResponse> {
  const response = await axios.post<IBulkFinalizePayrollResponse>(endpoints.payroll.bulkFinalize, data);
  return response.data;
}
