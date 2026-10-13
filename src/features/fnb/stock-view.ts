import type { IFnbLot, IFnbStockIngredient } from 'src/types/fnb';

import { normalizeVi } from './menu';

// ----------------------------------------------------------------------
// Xem tồn nguyên liệu và hạn dùng trên app (chỉ đọc): hàng hết / sắp hết lên đầu, lô quá hạn / sắp hết hạn lên đầu.
// Số liệu và trạng thái do máy chủ tính (GET /fnb/stock, GET /fnb/stock/lots) — giống trang web Kho nguyên liệu.
// ----------------------------------------------------------------------

export type Tone = 'error' | 'warning' | 'muted';

const STOCK_RANK: Record<string, number> = { out: 0, low: 1, ok: 2, idle: 3 };

/** Màu trạng thái tồn: hết = đỏ, sắp hết = vàng, còn lại = xám. */
export const stockTone = (status: string | undefined): Tone => (status === 'out' ? 'error' : status === 'low' ? 'warning' : 'muted');

/** Hết và sắp hết lên đầu, rồi theo tên; lọc theo chữ tìm không dấu. */
export function sortedIngredients(ingredients: readonly IFnbStockIngredient[], keyword = ''): IFnbStockIngredient[] {
  const kw = normalizeVi(keyword);
  return ingredients
    .filter((i) => !kw || normalizeVi(i.name).includes(kw) || normalizeVi(i.code).includes(kw))
    .sort(
      (a, b) =>
        (STOCK_RANK[a.status ?? 'ok'] ?? 2) - (STOCK_RANK[b.status ?? 'ok'] ?? 2) || a.name.localeCompare(b.name, 'vi')
    );
}

/** expired: đã quá hạn; expiring: còn không quá `expiringDays` ngày; ok: còn hạn; none: lô không ghi hạn. */
export type LotState = 'expired' | 'expiring' | 'ok' | 'none';

export function lotState(lot: Pick<IFnbLot, 'daysLeft' | 'expiryDate'>, expiringDays: number): LotState {
  if (lot.expiryDate == null || lot.daysLeft == null) return 'none';
  if (lot.daysLeft < 0) return 'expired';
  return lot.daysLeft <= expiringDays ? 'expiring' : 'ok';
}

export const lotTone = (state: LotState): Tone => (state === 'expired' ? 'error' : state === 'expiring' ? 'warning' : 'muted');

/** Lô còn hàng, hạn sớm nhất trước; lô không ghi hạn xuống cuối. */
export function sortedLots(lots: readonly IFnbLot[]): IFnbLot[] {
  return lots
    .filter((l) => l.remaining > 0)
    .sort((a, b) => {
      if (a.expiryDate == null || b.expiryDate == null) return a.expiryDate == null ? (b.expiryDate == null ? 0 : 1) : -1;
      return a.expiryDate.localeCompare(b.expiryDate) || a.productName.localeCompare(b.productName, 'vi');
    });
}

/** Số lô quá hạn / sắp hết hạn — để hiện nhãn trên tab. */
export function expiryCounts(lots: readonly IFnbLot[], expiringDays: number): { expired: number; expiring: number } {
  const states = lots.filter((l) => l.remaining > 0).map((l) => lotState(l, expiringDays));
  return { expired: states.filter((s) => s === 'expired').length, expiring: states.filter((s) => s === 'expiring').length };
}
