import axios, { endpoints } from './axios';
import type {
  IChangePasswordRequest,
  IChangeUserStatusRequest,
  IUpdateProfileRequest,
  IUser,
} from 'src/types/corecms-api';

// ----------------------------------------------------------------------

export type RNFile = { uri: string; name: string; type: string };

export async function getMe(): Promise<IUser> {
  const response = await axios.get<IUser>(endpoints.users.me);
  return response.data;
}

export async function getAllUsers(): Promise<IUser[]> {
  const response = await axios.get<IUser[]>(endpoints.users.list);
  return response.data;
}

/** [Admin/Manager] Chi tiết 1 người dùng. */
export async function getUserById(id: string): Promise<IUser> {
  const response = await axios.get<IUser>(endpoints.users.details(id));
  return response.data;
}

/** [Admin] Đổi trạng thái tài khoản (Active/Pending/Banned/Rejected). PATCH. */
export async function changeUserStatus(id: string, data: IChangeUserStatusRequest): Promise<void> {
  await axios.patch(endpoints.users.changeStatus(id), data);
}

export async function updateMyProfile(data: IUpdateProfileRequest): Promise<void> {
  await axios.put(endpoints.users.updateProfile, data);
}

export async function changeMyPassword(data: IChangePasswordRequest): Promise<void> {
  await axios.post(endpoints.users.changePassword, data);
}

export async function uploadMyAvatar(file: RNFile): Promise<{ objectKey: string }> {
  const formData = new FormData();
  formData.append('avatar', file as any);
  const response = await axios.post<{ objectKey: string }>(endpoints.users.uploadAvatar, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function uploadMyIdCard(
  idCardFront?: RNFile,
  idCardBack?: RNFile
): Promise<{ frontObjectKey?: string; backObjectKey?: string }> {
  const formData = new FormData();
  if (idCardFront) formData.append('idCardFront', idCardFront as any);
  if (idCardBack) formData.append('idCardBack', idCardBack as any);
  const response = await axios.post<{ frontObjectKey?: string; backObjectKey?: string }>(
    endpoints.users.uploadMyIdCard,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}
