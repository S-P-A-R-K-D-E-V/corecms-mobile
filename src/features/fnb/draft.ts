import type { IMenuDish, IMenuVariant } from 'src/types/fnb';

import type { LineInput } from './fnb-commands';
import { newId } from './fnb-ids';

// ----------------------------------------------------------------------
// Món đang chọn cho lượt kế tiếp (chưa gửi): chỉ nằm trên máy cho tới khi bấm "Gửi bar". Giá ở đây chỉ để xem
// trước theo thực đơn đã tải — máy chủ là nơi tính tiền duy nhất (contract 2), app không gửi giá cho dòng Item.
// Mỗi dòng có id do máy sinh ngay lúc thêm; id đó là `line.id` gửi lên.
// ----------------------------------------------------------------------

export type DraftTopping = { productId: string; name: string; quantity: number; unitPrice: number };

/** Lựa chọn của một nhóm combo; `quantity` là số lượng cho mỗi combo, `surcharge` đã nằm trong `unitPrice` của dòng. */
export type DraftComponent = {
  groupId: string;
  productId: string;
  name: string;
  variantName: string | null;
  quantity: number;
  surcharge: number;
};

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
  /** Dòng combo: mỗi nhóm một lựa chọn; rỗng với món thường. */
  components: DraftComponent[];
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
  opts: {
    quantity?: number;
    toppings?: DraftTopping[];
    components?: DraftComponent[];
    quickNotes?: string[];
    note?: string | null;
  } = {}
): DraftLine {
  // Combo: mỗi nhóm một lựa chọn (không gửi thì lấy mặc định); giá = giá combo + phụ thu; không có món thêm.
  const components = dish.combo ? (opts.components ?? comboComponents(dish)) : [];
  return {
    id: newId(),
    lineType: 'Item',
    dishId: dish.id,
    productId: variant.productId,
    name: dish.name,
    variantName: variant.name,
    unitPrice: variant.price + components.reduce((s, c) => s + c.surcharge, 0),
    quantity: clamp(opts.quantity ?? 1, 1, MAX_QTY),
    toppings: dish.combo
      ? []
      : (opts.toppings ?? [])
          .filter((t) => t.quantity > 0)
          .map((t) => ({ ...t, quantity: clamp(t.quantity, 1, MAX_TOPPING_QTY) })),
    components,
    quickNotes: (opts.quickNotes ?? []).slice(0, MAX_QUICK_NOTES),
    note: opts.note?.trim().slice(0, MAX_NOTE_LEN) || null,
  };
}

/** Lựa chọn của combo theo từng nhóm: lựa chọn đã chọn, không thì lựa chọn đầu tiên còn bán (hết cả nhóm: lựa chọn đầu). */
export function comboComponents(dish: IMenuDish, chosen: Record<string, string> = {}): DraftComponent[] {
  return (dish.combo?.groups ?? [])
    .map((group) => {
      const option =
        group.options.find((o) => o.productId === chosen[group.id]) ??
        group.options.find((o) => !o.isSoldOut) ??
        group.options[0];
      return option
        ? {
            groupId: group.id,
            productId: option.productId,
            name: option.name,
            variantName: option.variantName,
            quantity: option.quantity,
            surcharge: option.surcharge,
          }
        : null;
    })
    .filter((c): c is DraftComponent => !!c);
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
    components: [],
    quickNotes: [],
    note: input.note?.trim().slice(0, MAX_NOTE_LEN) || null,
  };
}

const componentKey = (l: DraftLine) =>
  l.components.map((c) => `${c.groupId}:${c.productId}`).sort().join(',');

const toppingKey = (l: DraftLine) =>
  l.toppings.map((t) => `${t.productId}x${t.quantity}`).sort().join(',');

/** Hai dòng giống hệt nhau (cùng size, món thêm, ghi chú) — bấm món lần nữa thì cộng số lượng thay vì thêm dòng. */
export function sameDraft(a: DraftLine, b: DraftLine): boolean {
  return (
    a.lineType === 'Item' &&
    b.lineType === 'Item' &&
    a.productId === b.productId &&
    toppingKey(a) === toppingKey(b) &&
    componentKey(a) === componentKey(b) &&
    [...a.quickNotes].sort().join('|') === [...b.quickNotes].sort().join('|') &&
    (a.note ?? '') === (b.note ?? '')
  );
}

export function addDraft(lines: readonly DraftLine[], line: DraftLine): DraftLine[] {
  const same = lines.find((l) => sameDraft(l, line));
  if (!same) return [...lines, line];
  return lines.map((l) => (l === same ? { ...l, quantity: clamp(l.quantity + line.quantity, 1, MAX_QTY) } : l));
}

/** Lựa chọn hiện có của một dòng, để mở lại bảng chọn món khi SỬA dòng đó (món đang chọn hoặc dòng chưa gửi bar). */
export type LineSeed = {
  variantId: string | null;
  quantity: number;
  /** Món thêm: productId → số phần cho một ly. */
  toppings: Record<string, number>;
  /** Combo: nhóm → productId đã chọn. */
  choices: Record<string, string>;
  quickNotes: string[];
  note: string;
};

export function lineSeed(line: {
  productId: string | null;
  quantity: number;
  toppings: readonly { productId: string; quantity: number }[];
  components?: readonly { groupId: string; productId: string }[];
  quickNotes: readonly string[];
  note: string | null;
}): LineSeed {
  return {
    variantId: line.productId,
    quantity: clamp(line.quantity, 1, MAX_QTY),
    toppings: Object.fromEntries(line.toppings.map((t) => [t.productId, t.quantity])),
    choices: Object.fromEntries((line.components ?? []).map((c) => [c.groupId, c.productId])),
    quickNotes: [...line.quickNotes],
    note: line.note ?? '',
  };
}

/** Thay một món đang chọn bằng bản đã sửa (giữ id và vị trí); trùng hệt một dòng khác thì gộp số lượng vào dòng đó. */
export function replaceDraft(lines: readonly DraftLine[], id: string, next: DraftLine): DraftLine[] {
  if (!lines.some((l) => l.id === id)) return [...lines];
  const same = lines.find((l) => l.id !== id && sameDraft(l, next));
  if (!same) return lines.map((l) => (l.id === id ? { ...next, id } : l));
  return lines
    .filter((l) => l.id !== id)
    .map((l) => (l === same ? { ...l, quantity: clamp(l.quantity + next.quantity, 1, MAX_QTY) } : l));
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
    // Chỉ dòng combo mới gửi lựa chọn (món thường gửi lựa chọn sẽ bị máy chủ từ chối).
    ...(line.components.length > 0 && {
      components: line.components.map((c) => ({ groupId: c.groupId, productId: c.productId })),
    }),
  };
}
