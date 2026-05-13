import axios, { endpoints } from './axios';
import type { IShiftAssignment, IShiftTemplate } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export async function getMySchedule(fromDate: string, toDate: string): Promise<IShiftAssignment[]> {
  const response = await axios.get<IShiftAssignment[]>(endpoints.shiftAssignments.mySchedule, {
    params: { fromDate, toDate },
  });
  return response.data;
}

export async function getAllShiftTemplates(): Promise<IShiftTemplate[]> {
  const response = await axios.get<IShiftTemplate[]>(endpoints.shiftTemplates.list);
  return response.data;
}
