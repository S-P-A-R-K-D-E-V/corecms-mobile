import axios, { endpoints } from './axios';
import type {
  IAttendanceLog,
  IAttendanceReport,
  IAttendanceRequest,
  IBranchLocation,
  ICheckInRequest,
  ICheckOutRequest,
  ICreateAttendanceRequestDto,
  IProcessAttendanceRequestDto,
  ISmartCheckInRequest,
  ISmartCheckOutRequest,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export async function smartCheckIn(data: ISmartCheckInRequest): Promise<IAttendanceLog> {
  const response = await axios.post<IAttendanceLog>(endpoints.attendance.smartCheckIn, data);
  return response.data;
}

export async function smartCheckOut(data: ISmartCheckOutRequest): Promise<IAttendanceLog[]> {
  const response = await axios.post<IAttendanceLog[]>(endpoints.attendance.smartCheckOut, data);
  return response.data;
}

export async function checkIn(data: ICheckInRequest): Promise<IAttendanceLog> {
  const response = await axios.post<IAttendanceLog>(endpoints.attendance.checkIn, data);
  return response.data;
}

export async function checkOut(data: ICheckOutRequest): Promise<IAttendanceLog> {
  const response = await axios.post<IAttendanceLog>(endpoints.attendance.checkOut, data);
  return response.data;
}

export async function getMyAttendanceLogs(fromDate: string, toDate: string): Promise<IAttendanceLog[]> {
  const response = await axios.get<IAttendanceLog[]>(endpoints.attendance.myLogs, {
    params: { fromDate, toDate },
  });
  return response.data;
}

export async function getMyAttendanceReport(fromDate: string, toDate: string): Promise<IAttendanceReport> {
  const response = await axios.get<IAttendanceReport>(endpoints.attendance.myReport, {
    params: { fromDate, toDate },
  });
  return response.data;
}

export async function getMyAttendanceRequests(): Promise<IAttendanceRequest[]> {
  const response = await axios.get<IAttendanceRequest[]>(endpoints.attendance.myRequests);
  return response.data;
}

export async function createAttendanceRequest(data: ICreateAttendanceRequestDto): Promise<IAttendanceRequest> {
  const response = await axios.post<IAttendanceRequest>(endpoints.attendance.requests, data);
  return response.data;
}

export async function processAttendanceRequest(id: string, data: IProcessAttendanceRequestDto): Promise<void> {
  await axios.patch(endpoints.attendance.processRequest(id), data);
}

export async function getBranchLocations(): Promise<IBranchLocation[]> {
  const response = await axios.get<IBranchLocation[]>(endpoints.branches.list);
  return response.data;
}
