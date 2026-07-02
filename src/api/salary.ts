import axios, { endpoints } from './axios';
import type { ISalaryConfiguration, IVersionedUpsertSalaryConfigRequest } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Cấu hình lương cá nhân (Admin/Manager). Đồng bộ core-fe salary.ts.
// ----------------------------------------------------------------------

/** Lịch sử cấu hình lương của 1 nhân viên (mới nhất trước). */
export async function getUserSalaryConfigs(userId: string): Promise<ISalaryConfiguration[]> {
  const response = await axios.get<ISalaryConfiguration[]>(endpoints.salaryConfig.byUser(userId));
  return response.data;
}

/** Đặt mức lương mới có hiệu lực từ ngày (tự đóng version cũ). */
export async function versionedUpsertSalaryConfig(
  data: IVersionedUpsertSalaryConfigRequest
): Promise<ISalaryConfiguration> {
  const response = await axios.post<ISalaryConfiguration>(endpoints.salaryConfig.versionedUpsert, data);
  return response.data;
}
