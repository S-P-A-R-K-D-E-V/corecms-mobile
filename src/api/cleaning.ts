import axios, { endpoints } from './axios';
import type { ICleaningTaskInstance, ICleaningWeekCell, IMyCleaningChecklist } from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export async function getMyCleaningChecklist(date: string): Promise<IMyCleaningChecklist[]> {
  const response = await axios.get<IMyCleaningChecklist[]>(endpoints.cleaning.myChecklist, {
    params: { date },
  });
  return response.data;
}

export type CleaningPhotoFile = { uri: string; name: string; type: string };

export async function completeCleaningTask(
  id: string,
  photo: CleaningPhotoFile
): Promise<ICleaningTaskInstance> {
  const formData = new FormData();
  formData.append('photo', photo as any);
  const response = await axios.post<ICleaningTaskInstance>(endpoints.cleaning.completeTask(id), formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getCleaningWeekOverview(fromDate: string, toDate: string): Promise<ICleaningWeekCell[]> {
  const response = await axios.get<ICleaningWeekCell[]>(endpoints.cleaning.weekOverview, {
    params: { fromDate, toDate },
  });
  return response.data;
}
