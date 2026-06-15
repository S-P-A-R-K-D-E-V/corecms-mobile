import axios, { endpoints } from './axios';
import type {
  IShiftRegistration,
  IRegisterShiftRequest,
  IUnregisterShiftRequest,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export async function registerShift(data: IRegisterShiftRequest): Promise<IShiftRegistration> {
  const response = await axios.post<IShiftRegistration>(endpoints.shiftRegistrations.register, data);
  return response.data;
}

export async function unregisterShift(data: IUnregisterShiftRequest): Promise<void> {
  await axios.post(endpoints.shiftRegistrations.unregister, data);
}

export async function getMyShiftRegistrations(fromDate: string, toDate: string): Promise<IShiftRegistration[]> {
  const response = await axios.get<IShiftRegistration[]>(endpoints.shiftRegistrations.myRegistrations, {
    params: { fromDate, toDate },
  });
  return response.data;
}
