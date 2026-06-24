// Mệnh giá tính theo nghìn đồng (1 = 1.000đ ... 500 = 500.000đ) — khớp core-fe & BE.
export const DENOMINATIONS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

/** Ngày hôm nay theo giờ Việt Nam (UTC+7), dạng YYYY-MM-DD — khớp BE. */
export function vnToday(): string {
  // Cộng 7h vào UTC rồi lấy phần ngày của chuỗi ISO → đúng ngày lịch VN
  // bất kể múi giờ thiết bị (BE dùng DateTime.UtcNow.AddHours(7)).
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(value || 0));
}

/** Tổng tiền mặt từ bảng số lượng mệnh giá (đơn vị: đồng). */
export function computeTotalCash(quantities: Record<number, number>): number {
  return DENOMINATIONS.reduce((sum, d) => sum + d * 1000 * (quantities[d] || 0), 0);
}

/** Chỉ giữ chữ số từ chuỗi tiền đang nhập (loại dấu chấm phân tách). */
export function parseAmount(value: string): string {
  return value.replace(/\D/g, '');
}

/** Định dạng số tiền đang nhập: "1000000" -> "1.000.000". */
export function formatAmountInput(raw: string): string {
  const digits = parseAmount(raw);
  if (!digits) return '';
  return new Intl.NumberFormat('vi-VN').format(Number(digits));
}
