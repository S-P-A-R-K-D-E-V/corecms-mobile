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

/** Mốc chốt đăng ký của một tuần (theo thứ 2 đầu tuần) — nhân viên đọc được để biết hạn chót. */
export type RegistrationLock = { weekStart: string; lockAt: string; isDefault: boolean; isLocked: boolean };

export async function getRegistrationLock(weekStart: string): Promise<RegistrationLock> {
  const response = await axios.get<RegistrationLock>(endpoints.shiftRegistrations.lock, { params: { weekStart } });
  return response.data;
}

/** [Admin/Manager] Đăng ký ca của MỌI nhân viên trong khoảng — nguồn "khóa ca". */
export async function getShiftRegistrations(fromDate: string, toDate: string): Promise<IShiftRegistration[]> {
  const response = await axios.get<IShiftRegistration[]>(endpoints.shiftRegistrations.list, {
    params: { fromDate, toDate },
  });
  return response.data;
}
