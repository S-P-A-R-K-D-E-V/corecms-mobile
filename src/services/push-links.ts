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

/**
 * Push kiểm tra cửa hàng (core-be StoreInspection: data.type "inspection-*") → màn trong app. Lỗi mới / quá hạn → lỗi
 * của tôi; nhắc kiểm nhanh, báo cáo tuần → màn Kiểm tra cửa hàng. Loại khác → null.
 */
export function inspectionPushRoute(data: unknown): string | null {
  const d = pushDataRecord(data);
  switch (d.type) {
    case 'inspection-fault':
    case 'inspection-overdue':
      return '/inspection/faults';
    case 'inspection-reminder':
    case 'inspection-weekly':
      return '/inspection';
    default:
      return typeof d.type === 'string' && d.type.startsWith('inspection-') ? '/inspection' : null;
  }
}

/** Push kiểm hàng khu vực mỗi ca (core-be ShiftStockCheck: data.type "shift-stock-check") → màn Kiểm hàng ca. Loại khác → null. */
export function stockCheckPushRoute(data: unknown): string | null {
  return pushDataRecord(data).type === 'shift-stock-check' ? '/hr/stock-check' : null;
}

/**
 * Push nhân sự (core-be NotificationCategory.Hr: văn bản cần xác nhận, nhiệm vụ, biên bản, kết quả tháng) → màn Nhân sự.
 * Push chỉ mang loại thông báo (không mang link), nên mở màn tổng có đếm việc cần làm. Loại khác → null.
 */
export function hrPushRoute(data: unknown): string | null {
  return pushDataRecord(data).category === 'Hr' ? '/hr' : null;
}

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
