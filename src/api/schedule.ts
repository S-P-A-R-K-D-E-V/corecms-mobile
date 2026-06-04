import axios, { endpoints } from './axios';
import type { IMyScheduleItem, IShiftSchedule, IShiftTemplate } from 'src/types/corecms-api';

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
