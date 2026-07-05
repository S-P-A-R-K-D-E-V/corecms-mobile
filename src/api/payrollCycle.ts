import axios, { endpoints } from './axios';
import type { ICreatePayrollCycleRequest, IPayrollCycle } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Chu kỳ lương (Admin/Manager). Đồng bộ core-fe payrollCycle.ts.
// ----------------------------------------------------------------------

export async function getAllPayrollCycles(): Promise<IPayrollCycle[]> {
  const response = await axios.get<IPayrollCycle[]>(endpoints.payrollCycle.list);
  return response.data;
}

export async function createPayrollCycle(data: ICreatePayrollCycleRequest): Promise<IPayrollCycle> {
  const response = await axios.post<IPayrollCycle>(endpoints.payrollCycle.create, data);
  return response.data;
}

/** [Admin] Bật/tắt hiển thị chu kỳ cho nhân viên (staff chỉ xem được my-payroll của chu kỳ đã bật). */
export async function setPayrollCycleVisibility(
  id: string,
  isVisibleToStaff: boolean
): Promise<IPayrollCycle> {
  const response = await axios.put<IPayrollCycle>(endpoints.payrollCycle.visibility(id), {
    isVisibleToStaff,
  });
  return response.data;
}
