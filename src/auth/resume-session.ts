import * as SecureStore from 'expo-secure-store';

import axiosInstance, { endpoints } from 'src/api/axios';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, hasSessionHost, isAuthRejection, restoreSession } from 'src/api/session';
import type { IAuthResponse } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Mở app (và thử lại khi chưa kết nối được): lấy lại phiên đăng nhập của MÁY NÀY.
//   ok         — có accessToken dùng được (đang có, hoặc vừa khôi phục bằng sessionToken — server gia
//                hạn phiên thêm 30 ngày); kèm hồ sơ /users/me nếu đọc được.
//   signed-out — máy không có phiên, hoặc server đã từ chối phiên (token đã được xoá) → trang đăng nhập.
//   offline    — không kết nối được máy chủ (mất mạng / 5xx / quá giờ): GIỮ NGUYÊN mọi token. Chưa coi là
//                đăng xuất — AuthProvider tự thử lại khi app quay lại nền trước / người dùng bấm "Thử lại".
// Không bao giờ đụng tới cửa hàng đã nhớ (storeProfile).
// ----------------------------------------------------------------------

export type ResumeResult =
  | {
      kind: 'ok';
      accessToken: string;
      refreshToken?: string;
      /** Hồ sơ GET /users/me (null nếu vừa khôi phục mà chưa đọc được — dùng `auth` dựng tạm). */
      me: any | null;
      /** Phản hồi restore-session (chỉ có khi vừa khôi phục). */
      auth: IAuthResponse | null;
    }
  | { kind: 'signed-out' }
  | { kind: 'offline' };

function jwtExpiry(token: string): number | null {
  try {
    const base64 = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '=='.slice(0, (4 - (base64.length % 4)) % 4);
    const { exp } = JSON.parse(atob(padded));
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** accessToken còn hạn theo đồng hồ máy (hết hạn / hỏng → khôi phục bằng sessionToken). */
export function isUsableToken(token: string | null | undefined, now = Date.now()): token is string {
  if (!token) return false;
  const exp = jwtExpiry(token);
  return exp !== null && now < exp;
}

export async function resumeSession(): Promise<ResumeResult> {
  // Bản cửa hàng chưa gắn cửa hàng: không gửi token sang địa chỉ dự phòng — về màn Chào mừng tìm cửa hàng.
  if (!hasSessionHost()) return { kind: 'signed-out' };
  const accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);

  if (isUsableToken(accessToken)) {
    try {
      // 401 thì axios tự khôi phục bằng sessionToken rồi gọi lại — token có thể đã đổi sau lần gọi này.
      const res = await axiosInstance.get(endpoints.users.me);
      const current = (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)) ?? accessToken;
      const refreshToken = (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) ?? undefined;
      return { kind: 'ok', accessToken: current, refreshToken, me: res.data, auth: null };
    } catch (err: any) {
      // axios chỉ xoá token khi server từ chối phiên dứt khoát → token không còn = đã đăng xuất.
      if (!(await SecureStore.getItemAsync(ACCESS_TOKEN_KEY))) return { kind: 'signed-out' };
      // Server trả lời rõ ràng (403/404…) — không phải mất mạng; 401 mà token còn nghĩa là chưa khôi phục
      // được phiên vì mạng → vẫn là offline.
      const status = typeof err?.status === 'number' ? err.status : undefined;
      if (status !== 401 && isAuthRejection(status)) return { kind: 'signed-out' };
      return { kind: 'offline' };
    }
  }

  let outcome;
  try {
    outcome = await restoreSession();
  } catch {
    return { kind: 'offline' }; // mất mạng / 5xx — sessionToken vẫn giữ
  }
  if (outcome.kind !== 'restored') return { kind: 'signed-out' };

  const { token, refreshToken } = outcome.data;
  let me: any | null = null;
  try {
    me = (await axiosInstance.get(endpoints.users.me)).data;
  } catch {
    // Đã có phiên — thiếu hồ sơ đầy đủ chỉ tạm thời (refreshUser / lần mở sau nạp lại).
  }
  return { kind: 'ok', accessToken: token, refreshToken: refreshToken ?? undefined, me, auth: outcome.data };
}
