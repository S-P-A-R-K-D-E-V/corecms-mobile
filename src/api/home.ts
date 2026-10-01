import axios, { endpoints } from './axios';
import type { ICurrentPayrollEstimate, ITodayBoard } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Dữ liệu riêng của trang chủ app (core-be: AttendanceController.today-board,
// PayrollController.my-current-estimate).
// ----------------------------------------------------------------------

/** Nhân sự hôm nay: ca được phân + trạng thái chấm công lúc này (Admin/Manager). */
export async function getTodayBoard(): Promise<ITodayBoard> {
  const response = await axios.get<ITodayBoard>(endpoints.attendance.todayBoard);
  return response.data;
}

/** Lương tạm tính kỳ đang chạy của chính mình. */
export async function getMyCurrentEstimate(): Promise<ICurrentPayrollEstimate> {
  const response = await axios.get<ICurrentPayrollEstimate>(endpoints.payroll.myCurrentEstimate);
  return response.data;
}
