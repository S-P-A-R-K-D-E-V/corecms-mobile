import type { IOpenOrder, IOrderLine } from 'src/types/fnb';

// ----------------------------------------------------------------------
// Giảm giá toàn đơn và sửa giá một dòng (quản lý) — theo hợp đồng API mục 5.10, 5.11. Máy chủ là nơi tính tiền; phần
// ở đây chỉ kiểm tra ô nhập và xem trước số tiền giảm theo cùng công thức (Percent làm tròn nửa lên).
// ----------------------------------------------------------------------

export const MAX_DONG = 999_999_999;
export const MAX_REASON = 255;

export type DiscountType = 'Percent' | 'Amount';

/** Số nguyên không âm nhập tay (bỏ dấu chấm / phẩy / khoảng trắng phân cách nghìn); không hợp lệ → null. */
export function parseDong(text: string): number | null {
  const digits = text.replace(/[.,\s]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

/** Số tiền giảm xem trước: Amount = min(value, subtotal); Percent = làm tròn nửa lên. */
export function discountAmount(type: DiscountType, value: number, subtotal: number): number {
  if (value <= 0 || subtotal <= 0) return 0;
  return type === 'Amount' ? Math.min(value, subtotal) : Math.min(Math.floor((subtotal * Math.min(value, 100) + 50) / 100), subtotal);
}

/** Dữ liệu gửi đặt giảm giá; null = ô nhập chưa hợp lệ (phần trăm 1–100, số tiền 1–tạm tính, bắt buộc lý do). */
export function discountInput(
  type: DiscountType,
  valueText: string,
  reason: string,
  subtotal: number
): { type: DiscountType; value: number; reason: string } | null {
  const value = parseDong(valueText);
  if (value == null || value < 1 || !reason.trim() || reason.trim().length > MAX_REASON) return null;
  if (type === 'Percent' ? value > 100 : value > subtotal) return null;
  return { type, value, reason: reason.trim() };
}

/** Dòng sửa giá được: món của thực đơn hoặc món tự do còn tính tiền. */
export const priceableLines = (order: IOpenOrder | null | undefined): IOrderLine[] =>
  (order?.lines ?? [])
    .filter((l) => l.quantity > 0 && (l.status === 'Pending' || l.status === 'Sent'))
    .sort((a, b) => a.seq - b.seq);

/** Dữ liệu gửi sửa giá một dòng; null = chưa hợp lệ (giá 0–999.999.999, khác giá đang áp, bắt buộc lý do). */
export function priceInput(
  line: Pick<IOrderLine, 'unitPrice'>,
  priceText: string,
  reason: string
): { unitPrice: number; reason: string } | null {
  const unitPrice = parseDong(priceText);
  if (unitPrice == null || unitPrice > MAX_DONG || unitPrice === line.unitPrice) return null;
  if (!reason.trim() || reason.trim().length > MAX_REASON) return null;
  return { unitPrice, reason: reason.trim() };
}

/** Dòng hiển thị một khách hàng: "Tên · số điện thoại". */
export const customerLabel = (c: { name: string; contactNumber?: string | null }) =>
  c.contactNumber ? `${c.name} · ${c.contactNumber}` : c.name;
