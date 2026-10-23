import { pushDataRecord } from './push-store';

// ----------------------------------------------------------------------
// Chạm thông báo đẩy → mở trang nào (phần thuần, test được).
// Đơn online vừa thanh toán (core-be OnlineOrderPaidMessage: category "Order", data { type: "online_order_paid",
// orderId, code }): app chưa có màn đơn online → mở trang Đơn online trên web của cửa hàng đang gắn, lọc đúng mã đơn
// (cùng đường dẫn với actionUrl của thông báo trong app). Gốc web lấy từ cửa hàng đang gắn, không lấy từ push.
// ----------------------------------------------------------------------

export const ONLINE_ORDER_PAID = 'online_order_paid';

/** Mã đơn online (core-be NewCode: "W" + 8 ký tự) — chỉ nhận chữ số / chữ cái / - _ cho chắc. */
const ORDER_CODE = /^[A-Za-z0-9_-]{1,40}$/;

/** URL trang Đơn online cho push "đơn online đã thanh toán"; push khác hoặc gốc web không phải http(s) → null. */
export function onlineOrderWebUrl(data: unknown, webOrigin: string | null | undefined): string | null {
  const d = pushDataRecord(data);
  if (d.type !== ONLINE_ORDER_PAID) return null;
  const origin = (webOrigin ?? '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/?#\s]+$/i.test(origin)) return null;
  const code = typeof d.code === 'string' ? d.code.trim() : '';
  const query = ORDER_CODE.test(code) ? `?code=${encodeURIComponent(code)}` : '';
  return `${origin}/dashboard/payment/online-orders${query}`;
}
