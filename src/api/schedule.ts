import axios, { endpoints } from './axios';
import type {
  IManageShiftAssignmentsRequest,
  IMyScheduleItem,
  IShiftAssignment,
  IShiftSchedule,
  IShiftTemplate,
  ISwapShiftAssignmentsRequest,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export async function getMySchedule(fromDate: string, toDate: string): Promise<IMyScheduleItem[]> {
  const response = await axios.get<IMyScheduleItem[]>(endpoints.shiftAssignments.mySchedule, {
    params: { fromDate, toDate },
  });
  return response.data;
}

export async function getAllShiftTemplates(): Promise<IShiftTemplate[]> {
  const response = await axios.get<IShiftTemplate[]>(endpoints.shiftTemplates.list);
  return response.data;
}

export async function getShiftSchedules(fromDate: string, toDate: string): Promise<IShiftSchedule[]> {
  const response = await axios.get<IShiftSchedule[]>(endpoints.shiftSchedules.list, {
    params: { fromDate, toDate },
  });
  return response.data;
}

/** [Manager] Ca làm của TẤT CẢ nhân viên trong khoảng ngày — lịch đội ngũ. */
export async function getTeamAssignments(fromDate: string, toDate: string): Promise<IShiftAssignment[]> {
  const response = await axios.get<IShiftAssignment[]>(endpoints.shiftAssignments.list, {
    params: { fromDate, toDate },
  });
  return response.data;
}

/** [Manager] Đặt danh sách nhân viên cho 1 ca 1 ngày — BE tự tính thêm/gỡ. */
export async function manageShiftAssignments(
  data: IManageShiftAssignmentsRequest
): Promise<{ added: number; removed: number }> {
  const response = await axios.post<{ added: number; removed: number }>(
    endpoints.shiftAssignments.manageShift,
    data
  );
  return response.data;
}

/** [Manager] Hoán đổi 2 phân công ca (đổi ca hộ nhân viên). */
export async function swapShiftAssignments(
  data: ISwapShiftAssignmentsRequest
): Promise<{ success: boolean }> {
  const response = await axios.post<{ success: boolean }>(endpoints.shiftAssignments.swap, data);
  return response.data;
}
