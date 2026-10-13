import * as SecureStore from 'expo-secure-store';

import axios, { endpoints } from './axios';
import { SESSION_TOKEN_KEY } from './session';
import type { ILoginSession } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Thiết bị đang đăng nhập — các phiên đăng nhập còn mở của chính tài khoản này (mọi cửa hàng), đăng xuất từng
// thiết bị hoặc mọi thiết bị khác từ xa. BE cắt ngay: access token của thiết bị đó bị từ chối ở request kế tiếp,
// kết nối realtime bị ngắt, máy thôi nhận thông báo đẩy.
//
// "Máy này là phiên nào": BE đọc mã phiên trong access token; token cấp trước khi có mã phiên (tối đa 24 giờ sau
// khi server cập nhật) thì nhận sessionToken của máy qua header — không bao giờ đặt trên URL.

const SESSION_TOKEN_HEADER = 'X-Session-Token';

async function sessionHeaders() {
  const sessionToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  return sessionToken ? { headers: { [SESSION_TOKEN_HEADER]: sessionToken } } : undefined;
}

/** Máy đang gọi đứng đầu (isCurrent), còn lại theo lần hoạt động gần nhất. */
export async function getLoginSessions(): Promise<ILoginSession[]> {
  const response = await axios.get<ILoginSession[]>(endpoints.auth.sessions, await sessionHeaders());
  return response.data;
}

/** Đăng xuất một thiết bị. Phiên đã tự đóng / không phải của mình → 404 Auth.LoginSessionNotFound. */
export async function revokeLoginSession(sessionId: string): Promise<void> {
  await axios.delete(endpoints.auth.sessionRevoke(sessionId));
}

/** Đăng xuất mọi thiết bị khác, giữ máy này. Trả số thiết bị đã đăng xuất. */
export async function revokeOtherLoginSessions(): Promise<number> {
  const response = await axios.post<{ revoked: number }>(
    endpoints.auth.sessionsRevokeOthers,
    undefined,
    await sessionHeaders()
  );
  return response.data.revoked;
}
