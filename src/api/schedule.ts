import axios, { endpoints } from './axios';
import type { IMyScheduleItem, IShiftAssignment, IShiftSchedule, IShiftTemplate } from 'src/types/corecms-api';

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
