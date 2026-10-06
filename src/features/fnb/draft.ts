import type { IMenuDish, IMenuVariant } from 'src/types/fnb';

import type { LineInput } from './fnb-commands';
import { newId } from './fnb-ids';

// ----------------------------------------------------------------------
// Món đang chọn cho lượt kế tiếp (chưa gửi): chỉ nằm trên máy cho tới khi bấm "Gửi bar". Giá ở đây chỉ để xem
// trước theo thực đơn đã tải — máy chủ là nơi tính tiền duy nhất (contract 2), app không gửi giá cho dòng Item.
// Mỗi dòng có id do máy sinh ngay lúc thêm; id đó là `line.id` gửi lên.
// ----------------------------------------------------------------------

export type DraftTopping = { productId: string; name: string; quantity: number; unitPrice: number };

export type DraftLine = {
  id: string;
  lineType: 'Item' | 'OpenItem';
  dishId: string | null;
  /** null với món tự do. */
  productId: string | null;
  name: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  toppings: DraftTopping[];
  quickNotes: string[];
  note: string | null;
};

export const MAX_QTY = 999;
export const MAX_TOPPING_QTY = 20;
export const MAX_NOTE_LEN = 255;
export const MAX_OPEN_ITEM_NAME = 200;
export const MAX_QUICK_NOTES = 10;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));

/** Thành tiền xem trước: quantity × (unitPrice + Σ topping.quantity × topping.unitPrice). */
export function draftAmount(line: DraftLine): number {
  return line.quantity * (line.unitPrice + line.toppings.reduce((s, t) => s + t.quantity * t.unitPrice, 0));
}

export function draftTotal(lines: readonly DraftLine[]): number {
  return lines.reduce((s, l) => s + draftAmount(l), 0);
}

export function draftCount(lines: readonly DraftLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

export function itemDraft(
  dish: IMenuDish,
  variant: IMenuVariant,
  opts: { quantity?: number; toppings?: DraftTopping[]; quickNotes?: string[]; note?: string | null } = {}
): DraftLine {
  return {
    id: newId(),
    lineType: 'Item',
    dishId: dish.id,
    productId: variant.productId,
    name: dish.name,
    variantName: variant.name,
    unitPrice: variant.price,
    quantity: clamp(opts.quantity ?? 1, 1, MAX_QTY),
    toppings: (opts.toppings ?? [])
      .filter((t) => t.quantity > 0)
      .map((t) => ({ ...t, quantity: clamp(t.quantity, 1, MAX_TOPPING_QTY) })),
    quickNotes: (opts.quickNotes ?? []).slice(0, MAX_QUICK_NOTES),
    note: opts.note?.trim().slice(0, MAX_NOTE_LEN) || null,
  };
}

export function openItemDraft(input: { name: string; unitPrice: number; quantity?: number; note?: string | null }): DraftLine {
  return {
    id: newId(),
    lineType: 'OpenItem',
    dishId: null,
    productId: null,
    name: input.name.trim().slice(0, MAX_OPEN_ITEM_NAME),
    variantName: null,
    unitPrice: clamp(input.unitPrice, 0, 999_999_999),
    quantity: clamp(input.quantity ?? 1, 1, MAX_QTY),
    toppings: [],
    quickNotes: [],
    note: input.note?.trim().slice(0, MAX_NOTE_LEN) || null,
  };
}

const toppingKey = (l: DraftLine) =>
  l.toppings.map((t) => `${t.productId}x${t.quantity}`).sort().join(',');

/** Hai dòng giống hệt nhau (cùng size, món thêm, ghi chú) — bấm món lần nữa thì cộng số lượng thay vì thêm dòng. */
export function sameDraft(a: DraftLine, b: DraftLine): boolean {
  return (
    a.lineType === 'Item' &&
    b.lineType === 'Item' &&
    a.productId === b.productId &&
    toppingKey(a) === toppingKey(b) &&
    [...a.quickNotes].sort().join('|') === [...b.quickNotes].sort().join('|') &&
    (a.note ?? '') === (b.note ?? '')
  );
}

export function addDraft(lines: readonly DraftLine[], line: DraftLine): DraftLine[] {
  const same = lines.find((l) => sameDraft(l, line));
  if (!same) return [...lines, line];
  return lines.map((l) => (l === same ? { ...l, quantity: clamp(l.quantity + line.quantity, 1, MAX_QTY) } : l));
}

/** Đổi số lượng; về 0 thì bỏ dòng. */
export function setDraftQty(lines: readonly DraftLine[], id: string, quantity: number): DraftLine[] {
  if (quantity <= 0) return lines.filter((l) => l.id !== id);
  return lines.map((l) => (l.id === id ? { ...l, quantity: clamp(quantity, 1, MAX_QTY) } : l));
}

/** Dòng gửi lên POST /lines — Item không gửi giá; OpenItem gửi tên + giá tự nhập. */
export function toLineInput(line: DraftLine): LineInput {
  if (line.lineType === 'OpenItem') {
    return { id: line.id, lineType: 'OpenItem', name: line.name, unitPrice: line.unitPrice, quantity: line.quantity, note: line.note };
  }
  return {
    id: line.id,
    lineType: 'Item',
    productId: line.productId!,
    quantity: line.quantity,
    toppings: line.toppings.map((t) => ({ productId: t.productId, quantity: t.quantity })),
    quickNotes: line.quickNotes,
    note: line.note,
  };
}
