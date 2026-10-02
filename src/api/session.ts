import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

import { getHostApi } from 'src/services/store-config';
import type { IAuthResponse } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Phiên đăng nhập của MÁY NÀY trên cửa hàng đang gắn:
//   accessToken  — JWT ~24h, gửi kèm mọi request (axios đọc lại mỗi lần gửi).
//   sessionToken — phiên đăng nhập của máy (LoginSession, trượt 30 ngày: mỗi lần khôi phục server gia
//                  hạn thêm). Hết accessToken thì đổi sessionToken lấy cái mới: POST /auth/restore-session.
// Quy tắc giữ phiên:
//   - Chỉ xoá token khi server TỪ CHỐI dứt khoát (4xx, trừ 408/429). Mất mạng / 5xx → giữ nguyên.
//   - Không bao giờ đụng tới cửa hàng đã nhớ (storeProfile) — xem store-config.
//   - Nhiều request cùng 401 thì chỉ khôi phục một lần (single-flight), các request chờ chung kết quả.
// ----------------------------------------------------------------------

export const ACCESS_TOKEN_KEY = 'accessToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';
export const SESSION_TOKEN_KEY = 'sessionToken';

const RESTORE_PATH = '/auth/restore-session';
const RESTORE_TIMEOUT_MS = 20_000;

export type RestoreOutcome =
  /** Đã có accessToken mới (đã ghi vào SecureStore). */
  | { kind: 'restored'; data: IAuthResponse }
  /** Server không nhận phiên này nữa (hết hạn / bị đăng xuất / tài khoản bị khoá) — đã xoá token. */
  | { kind: 'rejected' }
  /** Máy không có phiên để khôi phục. */
  | { kind: 'none' }
  /** Trong lúc chờ đã đăng xuất / đổi cửa hàng / đăng nhập lại — bỏ kết quả, không ghi đè. */
  | { kind: 'stale' };

/** 4xx dứt khoát — server thật sự không nhận token/phiên này (408 hết giờ, 429 quá tải thì thử lại sau). */
export function isAuthRejection(status: unknown): boolean {
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
}

/** Token hiện tại (SignalR đọc lại mỗi lần kết nối/kết nối lại — không giữ token cũ). */
export async function currentAccessToken(): Promise<string> {
  return (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)) ?? '';
}

/** Xoá token đăng nhập của máy (KHÔNG xoá cửa hàng đã nhớ). */
export async function clearAuthTokens(): Promise<void> {
  await Promise.all(
    [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, SESSION_TOKEN_KEY].map((k) => SecureStore.deleteItemAsync(k))
  );
}

let inflight: Promise<RestoreOutcome> | null = null;

/**
 * Khôi phục phiên bằng sessionToken đã lưu — dùng chung một lần gọi cho mọi nơi đang chờ.
 * Mất mạng / 5xx: ném lỗi, giữ nguyên mọi token để lần sau thử lại.
 */
export function restoreSession(): Promise<RestoreOutcome> {
  if (!inflight) {
    inflight = doRestore().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

async function doRestore(): Promise<RestoreOutcome> {
  const sessionToken = await SecureStore.getItemAsync(SESSION_TOKEN_KEY);
  if (!sessionToken) return { kind: 'none' };
  const host = getHostApi();
  // Phiên trong máy vẫn là phiên mình gửi đi, trên đúng cửa hàng đó.
  const unchanged = async () =>
    getHostApi() === host && (await SecureStore.getItemAsync(SESSION_TOKEN_KEY)) === sessionToken;

  let data: IAuthResponse;
  try {
    // axios trần, không qua axiosInstance: không gắn token cũ, không tự rơi lại vào nhánh 401 của chính nó.
    const res = await axios.post<IAuthResponse>(
      `${host}${RESTORE_PATH}`,
      { sessionToken },
      { timeout: RESTORE_TIMEOUT_MS }
    );
    data = res.data;
  } catch (err: any) {
    if (isAuthRejection(err?.response?.status)) {
      if (!(await unchanged())) return { kind: 'stale' };
      await clearAuthTokens();
      return { kind: 'rejected' };
    }
    throw err;
  }

  if (!data?.token) throw new Error('restore-session: thiếu token trong phản hồi');
  if (!(await unchanged())) return { kind: 'stale' };

  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, data.token);
  if (data.refreshToken) await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken);
  if (data.sessionToken) await SecureStore.setItemAsync(SESSION_TOKEN_KEY, data.sessionToken);
  return { kind: 'restored', data };
}
