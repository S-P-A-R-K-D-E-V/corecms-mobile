import axios, { endpoints } from './axios';
import type { IAssignRoleRequest, IRole } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Vai trò (Admin/Manager xem; gán vai trò chỉ Admin). Đồng bộ core-fe roles.ts.
// ----------------------------------------------------------------------

export async function getAllRoles(): Promise<IRole[]> {
  const response = await axios.get<IRole[]>(endpoints.roles.list);
  return response.data;
}

/** [Admin] Gán tập vai trò cho 1 người dùng (thay thế toàn bộ). */
export async function assignRoles(data: IAssignRoleRequest): Promise<void> {
  await axios.post(endpoints.roles.assign, data);
}
