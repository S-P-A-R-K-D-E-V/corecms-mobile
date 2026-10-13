import axios, { endpoints } from './axios';
import type { IQrLoginInspectResponse } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Duyệt đăng nhập web bằng mã QR — dùng JWT của người đang đăng nhập app, gọi API của cửa hàng app đang mở.
// Mã lấy từ QR trên trang đăng nhập web; duyệt xong trình duyệt đó đăng nhập bằng chính tài khoản này
// (phiên web 12 giờ, không gia hạn). BE từ chối mã của cửa hàng khác (409 Auth.QrLoginWrongStore) và mã
// đã hết hạn / đã dùng (400 Auth.InvalidQrLoginCode).

/** Xem trình duyệt nào đang xin đăng nhập; trang đăng nhập chuyển sang "đã quét, chờ xác nhận". */
export async function inspectQrLogin(code: string): Promise<IQrLoginInspectResponse> {
  const response = await axios.post<IQrLoginInspectResponse>(endpoints.auth.qrInspect, { code });
  return response.data;
}

export async function approveQrLogin(code: string): Promise<void> {
  await axios.post(endpoints.auth.qrApprove, { code });
}

export async function rejectQrLogin(code: string): Promise<void> {
  await axios.post(endpoints.auth.qrReject, { code });
}
