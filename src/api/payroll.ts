import axios, { endpoints } from './axios';
import type { IPayrollRecord, IPayrollShiftDetailResponse } from 'src/types/corecms-api';

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
