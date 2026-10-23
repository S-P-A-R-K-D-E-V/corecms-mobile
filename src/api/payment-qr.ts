import axios, { endpoints } from './axios';
import type { IPosPaymentConnectionsResponse } from 'src/types/erp';

// ----------------------------------------------------------------------
// Thanh toán QR ở quầy (core-be PaymentQrController). App mới dùng phần cấu hình kênh POS — QR qua kết nối S Payment
// (tạo mã / hỏi trạng thái) mới có ở quầy web.
// ----------------------------------------------------------------------

/** Cấu hình kênh POS + nguồn chuyển khoản qua kết nối chủ cửa hàng bật cho quầy. */
export async function getPosPaymentConnections(): Promise<IPosPaymentConnectionsResponse> {
  const res = await axios.get<IPosPaymentConnectionsResponse>(endpoints.paymentQr.connections);
  return res.data;
}
