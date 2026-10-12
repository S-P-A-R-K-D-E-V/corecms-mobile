import type { FnbDisposalReason, IFnbStockIngredient, IFnbUnitOption } from 'src/types/fnb';

import { parseQuantity } from './batch';
import { normalizeVi } from './menu';

// ----------------------------------------------------------------------
// Phiếu xuất huỷ nguyên liệu trên app — cùng luật với web (core-fe src/sections/fnb/lib/documents.ts): mỗi dòng một
// nguyên liệu, số lượng theo đơn vị gốc hoặc đơn vị mua, lý do theo dòng; ảnh tải thẳng lên R2 bằng URL ký sẵn.
// Nhân viên lập → chờ quản lý duyệt mới trừ kho; quản lý lập → trừ kho ngay.
// ----------------------------------------------------------------------

export const MAX_DISPOSAL_PHOTOS = 6;
export const MAX_DISPOSAL_LINES = 30;

export const DISPOSAL_REASONS: FnbDisposalReason[] = ['Expired', 'Damaged', 'Spilled', 'BadMake', 'Other'];

export type DisposalLineDraft = {
  productId: string;
  name: string;
  /** Tên đơn vị gốc (g, ml, cái…). */
  unit: string | null;
  units: IFnbUnitOption[];
  /** Ô nhập số lượng (chữ). */
  quantity: string;
  /** null = đơn vị gốc. */
  unitId: string | null;
  reason: FnbDisposalReason;
};

export const newDisposalLine = (ingredient: IFnbStockIngredient): DisposalLineDraft => ({
  productId: ingredient.id,
  name: ingredient.name,
  unit: ingredient.unit,
  units: ingredient.units ?? [],
  quantity: '',
  unitId: null,
  reason: 'Expired',
});

/** Nguyên liệu khớp chữ tìm (bỏ dấu, theo tên hoặc mã), chưa có trong phiếu; tối đa `limit`. */
export function searchIngredients(
  ingredients: readonly IFnbStockIngredient[],
  keyword: string,
  taken: ReadonlySet<string>,
  limit = 8
): IFnbStockIngredient[] {
  const kw = normalizeVi(keyword);
  return ingredients
    .filter((i) => !taken.has(i.id) && (!kw || normalizeVi(i.name).includes(kw) || normalizeVi(i.code).includes(kw)))
    .slice(0, limit);
}

/** Số lượng quy về đơn vị gốc; null khi ô nhập chưa hợp lệ. */
export function baseQuantity(line: DisposalLineDraft): number | null {
  const quantity = parseQuantity(line.quantity);
  if (quantity == null || quantity <= 0) return null;
  const factor = line.unitId == null ? 1 : line.units.find((u) => u.unitId === line.unitId)?.factor;
  return factor ? Math.round(quantity * factor * 10_000) / 10_000 : null;
}

/** Lỗi đầu tiên của phiếu đang soạn (khoá chữ i18n); null = gửi được. */
export function disposalError(lines: readonly DisposalLineDraft[]): 'fnbStock.disposalNeedLine' | 'fnbStock.disposalBadQty' | null {
  if (lines.length === 0) return 'fnbStock.disposalNeedLine';
  return lines.some((l) => baseQuantity(l) == null) ? 'fnbStock.disposalBadQty' : null;
}

/** Dòng gửi POST /fnb/disposals: số lượng theo đơn vị đã chọn (máy chủ tự quy đổi). */
export function toDisposalLines(lines: readonly DisposalLineDraft[]) {
  return lines.map((l) => ({
    productId: l.productId,
    quantity: parseQuantity(l.quantity) ?? 0,
    unitId: l.unitId,
    reason: l.reason,
  }));
}
