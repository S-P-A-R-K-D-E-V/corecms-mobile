import axios, { endpoints } from './axios';
import type {
  IConfirmShiftSwapTargetRequest,
  ICreateShiftSwapRequestRequest,
  IShiftAssignment,
  IShiftSwapRequest,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export async function createShiftSwapRequest(
  data: ICreateShiftSwapRequestRequest
): Promise<IShiftSwapRequest> {
  const response = await axios.post<IShiftSwapRequest>(endpoints.shiftSwap.create, data);
  return response.data;
}

export async function getMyShiftSwapRequests(): Promise<IShiftSwapRequest[]> {
  const response = await axios.get<IShiftSwapRequest[]>(endpoints.shiftSwap.myRequests);
  return response.data;
}

export async function getMyConfirmationRequests(): Promise<IShiftSwapRequest[]> {
  const response = await axios.get<IShiftSwapRequest[]>(endpoints.shiftSwap.myConfirmationRequests);
  return response.data;
}

export async function confirmShiftSwapTarget(
  id: string,
  data: IConfirmShiftSwapTargetRequest
): Promise<IShiftSwapRequest> {
  const response = await axios.put<IShiftSwapRequest>(endpoints.shiftSwap.targetConfirm(id), data);
  return response.data;
}

// Ca làm của một nhân viên khác trong khoảng ngày — dùng để chọn ca muốn đổi
export async function getStaffAssignments(
  fromDate: string,
  toDate: string,
  staffId: string
): Promise<IShiftAssignment[]> {
  const response = await axios.get<IShiftAssignment[]>(endpoints.shiftAssignments.list, {
    params: { fromDate, toDate, staffId },
  });
  return response.data;
}
