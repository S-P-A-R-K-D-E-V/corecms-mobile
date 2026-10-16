import axios, { endpoints } from './axios';
import type { IAssignRoleRequest, ICustomRole, IRole, IUserRoleAssignment } from 'src/types/corecms-api';

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

/** [Admin] Vai trò tuỳ chỉnh của cửa hàng (tạo / sửa trên web). */
export async function getCustomRoles(): Promise<ICustomRole[]> {
  const response = await axios.get<ICustomRole[]>(endpoints.customRoles.list);
  return response.data;
}

/** [Admin] Vai trò hệ thống + vai trò tuỳ chỉnh đang được gán cho 1 người (tách riêng, không gồm vai trò gốc). */
export async function getUserRoleAssignment(userId: string): Promise<IUserRoleAssignment> {
  const response = await axios.get<IUserRoleAssignment>(endpoints.customRoles.userAssignment(userId));
  return response.data;
}

/** [Admin] Đặt đúng danh sách vai trò tuỳ chỉnh của 1 người. */
export async function setUserCustomRoles(userId: string, customRoleIds: string[]): Promise<void> {
  await axios.put(endpoints.customRoles.userAssignment(userId), { customRoleIds });
}
