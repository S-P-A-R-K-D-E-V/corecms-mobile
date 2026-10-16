import axios from 'axios';

import axiosInstance from './axios';
import { getHostApi } from 'src/services/store-config';
import { getCounterKey } from 'src/services/counter-mode';
import type { IAuthResponse } from 'src/types/corecms-api';
import { getLocale, t } from 'src/i18n';

// ----------------------------------------------------------------------
// Máy quầy (core-be CounterController / CounterDevicesController):
//   - Cấp máy quầy: JWT của chủ cửa hàng / quản lý đang đăng nhập trên chính máy (POST /counter-devices).
//   - Còn lại: key thiết bị (header X-Kiosk-Key), KHÔNG kèm JWT người dùng và không đi qua cơ chế khôi phục phiên
//     của axiosInstance (401 ở đây là key máy quầy đã bị thu hồi, không phải hết phiên người dùng).
// Lỗi trả về problem+json: { type: "Counter.InvalidCode", title: "<câu hiển thị>" }.

export type CounterProvisionResult = {
  deviceId: string;
  deviceName: string;
  branchId: string;
  branchName: string;
  deviceKey: string;
};

export type CounterPerson = {
  userId: string;
  fullName: string;
  avatarUrl?: string | null;
  role: 'Staff' | 'Manager' | 'Admin' | string;
  shiftName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  /** working | upcoming | ended | manager */
  status: string;
  canSignIn: boolean;
  hasApp: boolean;
  sessionEndsAt?: string | null;
  /** false: ca hôm nay chưa gắn chi nhánh này (cửa hàng nhiều chi nhánh) — xếp riêng cuối danh sách. */
  atThisBranch?: boolean;
};

export type CounterRoster = {
  deviceId: string;
  deviceName: string;
  branchId: string;
  branchName: string;
  people: CounterPerson[];
};

export type CounterLoginRequested = { requestId: string; expiresInSeconds: number; sentToDevices: number };

export type CounterError = { code: string; message: string; status?: number };

export async function provisionCounterDevice(branchId: string, deviceName: string): Promise<CounterProvisionResult> {
  const res = await axiosInstance.post<CounterProvisionResult>('/counter-devices', { branchId, deviceName });
  return res.data;
}

const counterAxios = axios.create({ timeout: 20_000 });

/**
 * Câu lỗi Counter.* của server chỉ có tiếng Việt: app không ở tiếng Việt thì dịch theo mã, lấy số (lần thử còn lại,
 * số giây chờ) từ câu gốc. Mã lạ → null (giữ câu của server).
 */
export function localizedServerError(code: string, serverMessage: string): string | null {
  if (getLocale() === 'vi' || !code.startsWith('Counter.')) return null;
  const key = `counter.serverErrors.${code.slice('Counter.'.length)}`;
  const n = serverMessage.match(/\d+/)?.[0] ?? '';
  const text = t(key, { n });
  return text === key ? null : text;
}

counterAxios.interceptors.request.use(async (config) => {
  config.baseURL = getHostApi();
  const key = await getCounterKey();
  if (key) config.headers.set('X-Kiosk-Key', key);
  return config;
});

counterAxios.interceptors.response.use(
  (res) => res,
  (error) => {
    const data = error?.response?.data ?? {};
    const status: number | undefined = error?.response?.status;
    const code: string =
      typeof data.type === 'string' && data.type.includes('.') ? data.type : status === 401 ? 'Counter.Unauthorized' : 'Network';
    const err: CounterError = {
      code,
      message:
        localizedServerError(code, typeof data.title === 'string' ? data.title : '') ||
        (typeof data.title === 'string' && data.title) ||
        (status === 401 ? t('counter.errors.revoked') : status === 429 ? t('counter.errors.tooFast') : t('common.network')),
      status,
    };
    return Promise.reject(err);
  }
);

export async function getCounterRoster(): Promise<CounterRoster> {
  const res = await counterAxios.get<CounterRoster>('/counter/roster');
  return res.data;
}

export async function requestCounterLogin(userId: string): Promise<CounterLoginRequested> {
  const res = await counterAxios.post<CounterLoginRequested>('/counter/login-requests', { userId });
  return res.data;
}

export async function verifyCounterLogin(requestId: string, code: string): Promise<IAuthResponse> {
  const res = await counterAxios.post<IAuthResponse>(`/counter/login-requests/${encodeURIComponent(requestId)}/verify`, { code });
  return res.data;
}

/** Người không có app trên điện thoại: chọn tên rồi nhập mật khẩu tài khoản (sai 5 lần khoá 15 phút trên máy này). */
export async function counterPasswordLogin(userId: string, password: string): Promise<IAuthResponse> {
  const res = await counterAxios.post<IAuthResponse>('/counter/password-login', { userId, password });
  return res.data;
}

export type DisplayConfigDto = {
  intervalSeconds: number;
  /** url: link tải có chữ ký (hạn 24h, hỗ trợ Range — video phát được trên iPad / Safari); thiếu thì ghép từ key. */
  slides: { key: string; kind: 'image' | 'video'; title?: string | null; url?: string | null }[];
};

/** Quảng cáo màn hình khách của chi nhánh máy quầy (đọc bằng key máy quầy — chạy cả lúc chưa ai đăng nhập). */
export async function getCounterDisplayConfig(): Promise<DisplayConfigDto> {
  const res = await counterAxios.get<DisplayConfigDto>('/counter/display-config');
  return res.data;
}

/** Như trên nhưng cho máy thường (người đang đăng nhập), theo chi nhánh đang làm việc. */
export async function getDisplayConfig(branchId?: string | null): Promise<DisplayConfigDto> {
  const res = await axiosInstance.get<DisplayConfigDto>('/pos-display/config', { params: branchId ? { branchId } : undefined });
  return res.data;
}

export async function unpairCounter(): Promise<void> {
  await counterAxios.post('/counter/unpair');
}

// ── Đăng nhập máy quầy bằng mã QR (dự phòng khi điện thoại không nhận được mã) ──
// Cùng API với trang đăng nhập web (/auth/qr/*): máy quầy xin mã kèm ảnh QR (server vẽ), nhân viên quét bằng app trên
// điện thoại và duyệt; máy quầy đổi mã + verifier lấy phiên. Gửi kèm key máy quầy khi đổi → phiên gắn máy, hết ca thì hết.

export type CounterQrStart = { code: string; expiresInSeconds: number; pollIntervalSeconds: number; qrImage?: string | null };

export async function startCounterQr(codeChallenge: string): Promise<CounterQrStart> {
  const res = await counterAxios.post<CounterQrStart>('/auth/qr/start', { codeChallenge, image: true });
  return res.data;
}

export async function counterQrStatus(code: string): Promise<'pending' | 'scanned' | 'approved' | 'rejected' | 'expired'> {
  const res = await counterAxios.post<{ status: string }>('/auth/qr/status', { code });
  return res.data.status as any;
}

export async function exchangeCounterQr(code: string, codeVerifier: string): Promise<IAuthResponse> {
  const res = await counterAxios.post<IAuthResponse>('/auth/qr/exchange', { code, codeVerifier });
  return res.data;
}
