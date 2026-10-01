import { create } from 'zustand';

import type { IProductChild, IProductListItem } from 'src/types/erp';

// ----------------------------------------------------------------------
// Giỏ hàng màn Bán hàng — dùng chung cho nút "Bán món này" ở trang hàng hoá. Một dòng = 1 sản phẩm
// (hoặc 1 biến thể); bấm lại cùng món thì tăng số lượng.
// ----------------------------------------------------------------------

export type CartLine = {
  key: string;
  productId: string;
  /** Biến thể = row con (MasterProductId) — core-be trừ kho đúng row con. */
  variantId?: string;
  code: string;
  name: string;
  /** Giá niêm yết (giá bán của sản phẩm/biến thể). */
  listPrice: number;
  /** Giá bán dòng này — chỉ quản lý được đổi khác giá niêm yết. */
  price: number;
  qty: number;
  stock: number;
};

type CartState = {
  lines: CartLine[];
  add: (line: Omit<CartLine, 'key' | 'qty' | 'price'> & { qty?: number }) => void;
  setQty: (key: string, qty: number) => void;
  setPrice: (key: string, price: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>((set) => ({
  lines: [],
  add: (line) =>
    set((s) => {
      const key = line.variantId ?? line.productId;
      const existing = s.lines.find((l) => l.key === key);
      if (existing) {
        return { lines: s.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + (line.qty ?? 1) } : l)) };
      }
      return { lines: [...s.lines, { ...line, key, qty: line.qty ?? 1, price: line.listPrice }] };
    }),
  setQty: (key, qty) =>
    set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.key !== key) : s.lines.map((l) => (l.key === key ? { ...l, qty } : l)) })),
  setPrice: (key, price) => set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, price: Math.max(0, price) } : l)) })),
  remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
  clear: () => set({ lines: [] }),
}));

export const cartTotal = (lines: CartLine[]) => lines.reduce((s, l) => s + l.price * l.qty, 0);
export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.qty, 0);

const onHand = (inv?: { onHand?: number | null }[] | null) => (inv ?? []).reduce((s, i) => s + (i.onHand ?? 0), 0);

/** Dòng giỏ từ 1 sản phẩm không có biến thể. */
export function lineFromProduct(p: Pick<IProductListItem, 'id' | 'code' | 'name' | 'basePrice' | 'inventories'>) {
  return { productId: p.id, code: p.code, name: p.name, listPrice: p.basePrice, stock: onHand(p.inventories) };
}

/** Dòng giỏ từ 1 biến thể (row con) của sản phẩm cha. */
export function lineFromVariant(parent: Pick<IProductListItem, 'id'>, c: IProductChild) {
  return {
    productId: parent.id,
    variantId: c.id,
    code: c.code,
    name: c.fullName || c.name,
    listPrice: c.basePrice,
    stock: onHand(c.inventories),
  };
}
