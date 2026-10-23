import axios, { endpoints } from './axios';
import type { ICreateQrPaymentRequest, IPosPaymentConnectionsResponse, IQrPayment } from 'src/types/erp';

// ----------------------------------------------------------------------
// Thanh toán QR ở quầy (core-be PaymentQrController): cấu hình kênh POS + mã QR động qua kết nối S Payment (tạo mã,
// hỏi trạng thái, huỷ). VietQR theo tài khoản vẫn là ảnh tĩnh, không qua đây.
// ----------------------------------------------------------------------

/** Cấu hình kênh POS + nguồn chuyển khoản qua kết nối chủ cửa hàng bật cho quầy. */
export async function getPosPaymentConnections(): Promise<IPosPaymentConnectionsResponse> {
  const res = await axios.get<IPosPaymentConnectionsResponse>(endpoints.paymentQr.connections);
  return res.data;
}

export async function createQrPayment(data: ICreateQrPaymentRequest): Promise<IQrPayment> {
  const res = await axios.post<IQrPayment>(endpoints.paymentQr.create, data);
  return res.data;
}

export async function getQrPaymentStatus(id: string): Promise<IQrPayment> {
  const res = await axios.get<IQrPayment>(endpoints.paymentQr.status(id));
  return res.data;
}

export async function cancelQrPayment(id: string): Promise<void> {
  await axios.delete(endpoints.paymentQr.cancel(id));
}
