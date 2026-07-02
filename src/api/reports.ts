import axios, { endpoints } from './axios';
import type {
  IDashboardSummary,
  IRevenueReport,
  IPaymentMethodReport,
  IAttendanceReport,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Client báo cáo cho dashboard Quản trị. Tất cả endpoint đã có sẵn ở BE
// (đồng bộ core-fe src/api/reports.ts) — mobile chỉ đọc, không ghi.
// ----------------------------------------------------------------------

export async function getDashboardSummary(): Promise<IDashboardSummary> {
  const response = await axios.get<IDashboardSummary>(endpoints.reports.dashboard);
  return response.data;
}

export async function getRevenueReport(params: {
  fromDate: string;
  toDate: string;
  groupBy?: string;
}): Promise<IRevenueReport> {
  const response = await axios.get<IRevenueReport>(endpoints.reports.revenue, { params });
  return response.data;
}

export async function getPaymentMethodReport(params: {
  fromDate: string;
  toDate: string;
}): Promise<IPaymentMethodReport[]> {
  const response = await axios.get<IPaymentMethodReport[]>(endpoints.reports.paymentMethods, {
    params,
  });
  return response.data;
}

export async function getAttendanceReport(params: {
  fromDate: string;
  toDate: string;
}): Promise<IAttendanceReport[]> {
  const response = await axios.get<IAttendanceReport[]>(endpoints.attendance.report, { params });
  return response.data;
}
