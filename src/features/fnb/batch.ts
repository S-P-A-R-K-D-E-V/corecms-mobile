import type { IFnbBatchRecipeItem, IFnbBatchRecipeLine } from 'src/types/fnb';

// ----------------------------------------------------------------------
// Pha mẻ bán thành phẩm trên app (cold brew, syrup, kem muối…) — cùng luật với web (core-fe src/sections/fnb/lib/batch.ts):
// nguyên liệu = công thức × số mẻ, sản lượng mặc định theo công thức, hạn = hôm nay + số ngày bảo quản. Ghi kho ngay.
// ----------------------------------------------------------------------

export const MAX_BATCH_COUNT = 50;
export const MAX_SHELF_DAYS = 365;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Nguyên liệu cho `count` mẻ. */
export const scaleLines = (lines: readonly IFnbBatchRecipeLine[], count: number): IFnbBatchRecipeLine[] =>
  lines.map((l) => ({ ingredientId: l.ingredientId, quantity: round4(l.quantity * count) }));

/** Sản lượng theo công thức cho `count` mẻ; null khi chưa có công thức. */
export const plannedYield = (item: Pick<IFnbBatchRecipeItem, 'yieldQuantity'>, count: number) =>
  item.yieldQuantity == null ? null : round4(item.yieldQuantity * count);

/** Ngày theo giờ máy dạng yyyy-MM-dd. */
export const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** "2026-10-15" → "15/10/2026". */
export const fDay = (day: string) => day.split('-').reverse().join('/');

/** Số nhập tay (chấp nhận dấu phẩy thập phân); không hợp lệ → null. */
export function parseQuantity(text: string): number | null {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
}

/** Số lượng gọn: tối đa 3 số lẻ, dấu phẩy thập phân. */
export const fQty = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 3 });

/** Bán thành phẩm đã có công thức mẻ (pha được). */
export const brewable = (items: readonly IFnbBatchRecipeItem[]) =>
  items.filter((i) => i.yieldQuantity != null && i.lines.length > 0);

/** Nguyên liệu không đủ cho số mẻ định pha (vẫn pha được — kho cho phép âm — nhưng cần báo). */
export function shortages(
  lines: readonly IFnbBatchRecipeLine[],
  onHand: ReadonlyMap<string, number>
): { ingredientId: string; missing: number }[] {
  return lines
    .map((l) => ({ ingredientId: l.ingredientId, missing: round4(l.quantity - (onHand.get(l.ingredientId) ?? 0)) }))
    .filter((s) => s.missing > 0);
}

/** Dữ liệu gửi POST /fnb/batches; null = chưa hợp lệ. Sản lượng trùng công thức thì không gửi (máy chủ tự tính). */
export function batchRequest(
  item: IFnbBatchRecipeItem,
  input: { count: number; actualYield: string; shelfDays: number | null; today: string }
): { productId: string; batchCount: number; actualYield: number | null; expiryDate: string | null } | null {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > MAX_BATCH_COUNT) return null;

  const planned = plannedYield(item, input.count);
  const actual = input.actualYield.trim() === '' ? planned : parseQuantity(input.actualYield);
  if (actual == null || actual <= 0) return null;

  return {
    productId: item.productId,
    batchCount: input.count,
    actualYield: planned != null && Math.abs(actual - planned) < 0.00005 ? null : actual,
    expiryDate: input.shelfDays == null ? null : addDays(input.today, input.shelfDays),
  };
}

/** Nhân viên tự huỷ phiếu pha của mình trong khoảng này (phút); quản lý huỷ được mọi phiếu. */
export const OWN_CANCEL_MINUTES = 60;

/** Người đang dùng app huỷ được phiếu này không (máy chủ vẫn kiểm tra lại). */
export function canCancelBatch(
  batch: { status: string; createdById?: string; createdAt?: string },
  userId: string | undefined,
  isManager: boolean,
  now: number
): boolean {
  if (batch.status !== 'Completed') return false;
  if (isManager) return true;
  if (!userId || batch.createdById !== userId || !batch.createdAt) return false;
  return now - Date.parse(batch.createdAt) <= OWN_CANCEL_MINUTES * 60_000;
}
