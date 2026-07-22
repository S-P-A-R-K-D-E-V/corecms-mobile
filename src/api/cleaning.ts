import axios, { endpoints } from './axios';
import type {
  ICleaningTaskDefinition,
  ICleaningTaskInstance,
  ICleaningTaskTemplate,
  ICleaningTemplateWeekCell,
  ICleaningWeekCell,
  ICreateCleaningTaskDefinitionRequest,
  ICreateCleaningTaskTemplateRequest,
  IMyCleaningChecklist,
  IUpdateCleaningTaskDefinitionRequest,
} from 'src/types/corecms-api';

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

// ----------------------------------------------------------------------
// Task library (Admin CRUD)

export async function getCleaningTaskDefinitions(): Promise<ICleaningTaskDefinition[]> {
  const response = await axios.get<ICleaningTaskDefinition[]>(endpoints.cleaning.taskDefinitions);
  return response.data;
}

export async function createCleaningTaskDefinition(
  data: ICreateCleaningTaskDefinitionRequest
): Promise<ICleaningTaskDefinition> {
  const response = await axios.post<ICleaningTaskDefinition>(endpoints.cleaning.taskDefinitions, data);
  return response.data;
}

export async function updateCleaningTaskDefinition(
  id: string,
  data: IUpdateCleaningTaskDefinitionRequest
): Promise<ICleaningTaskDefinition> {
  const response = await axios.put<ICleaningTaskDefinition>(endpoints.cleaning.taskDefinitionDetails(id), data);
  return response.data;
}

export async function deleteCleaningTaskDefinition(id: string): Promise<void> {
  await axios.delete(endpoints.cleaning.taskDefinitionDetails(id));
}

// ----------------------------------------------------------------------
// Checklist week builder (Admin)

export async function getCleaningTemplateWeek(weekStart: string): Promise<ICleaningTemplateWeekCell[]> {
  const response = await axios.get<ICleaningTemplateWeekCell[]>(endpoints.cleaning.templateWeek, {
    params: { weekStart },
  });
  return response.data;
}

export async function createCleaningTaskTemplate(
  data: ICreateCleaningTaskTemplateRequest
): Promise<ICleaningTaskTemplate> {
  const response = await axios.post<ICleaningTaskTemplate>(endpoints.cleaning.templates, data);
  return response.data;
}

export async function deleteCleaningTaskTemplate(id: string): Promise<void> {
  await axios.delete(endpoints.cleaning.templateDetails(id));
}

export async function duplicateCleaningWeek(weekStart: string): Promise<{ createdCount: number }> {
  const response = await axios.post<{ createdCount: number }>(endpoints.cleaning.duplicateWeek, { weekStart });
  return response.data;
}
