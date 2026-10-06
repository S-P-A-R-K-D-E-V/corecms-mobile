import { create } from 'zustand';

import { prefs, PrefKeys } from 'src/services/storage';
import type { IProductChild, IProductListItem } from 'src/types/erp';

import { isSaleInDoubt, requestIdFor, type PendingSale, type SaleAttempt, type SaleDraft, type SaleRequest } from './sale-request';

// ----------------------------------------------------------------------
// Giỏ hàng màn Bán hàng — dùng chung cho nút "Bán món này" ở trang hàng hoá. Một dòng = 1 sản phẩm
// (hoặc 1 biến thể); bấm lại cùng món thì tăng số lượng.
//
// Giỏ + lần bán chưa có kết quả (`pending`, kèm mã chống trùng) được ghi xuống máy theo từng cửa hàng
// (`pref.posCart.<mã cửa hàng>`): app bị tắt / tải lại bản cập nhật không mất giỏ, và gửi lại lần bán đang treo
// vẫn dùng đúng mã cũ nên không sinh hoá đơn thứ hai. Trong lúc một lần bán còn treo (đang gửi / chưa biết kết
// quả) giỏ bị khoá — xem sale-request.ts.
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

type NewLine = Omit<CartLine, 'key' | 'qty' | 'price'> & { qty?: number };

type CartState = {
  lines: CartLine[];
  /** Lần bán chưa có kết quả dứt khoát (kèm gói tin + mã chống trùng). */
  pending: PendingSale | null;
  /** Mã cửa hàng của giỏ đang giữ; null = chưa nạp từ máy. */
  scope: string | null;
  hydrated: boolean;
  /** Thêm món; false = giỏ đang khoá vì còn lần bán chưa biết kết quả. */
  add: (line: NewLine) => boolean;
  setQty: (key: string, qty: number) => void;
  setPrice: (key: string, price: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  /** Đọc giỏ đã lưu của cửa hàng `scope` — không bao giờ ném lỗi. */
  hydrate: (scope: string) => Promise<void>;
  /** Quên giỏ của cửa hàng `scope` (đổi cửa hàng); lần bán còn treo thì giữ bản đã lưu để quay lại kiểm tra. */
  forget: (scope: string) => Promise<void>;
  /**
   * Bắt đầu gửi một lần bán: gắn mã chống trùng (giữ mã cũ nếu gửi lại đúng nội dung), ghi xuống máy XONG rồi mới
   * trả gói tin để gửi. Đang có lần bán treo thì trả lại đúng gói đó (không mở lần bán thứ hai).
   */
  beginSale: (draft: SaleDraft) => Promise<SaleRequest>;
  /** Gửi lại lần bán đang treo với đúng gói + mã đã lưu; không có thì null. */
  retrySale: () => Promise<SaleRequest | null>;
  /** Ghi kết quả của lần gửi mang mã `clientRequestId` (lệch mã = kết quả của lần bán khác → bỏ qua). */
  settleSale: (clientRequestId: string, outcome: SaleAttempt['kind']) => void;
  /** Bỏ theo dõi lần bán đang treo (người dùng đã tự kiểm tra hoá đơn) — giỏ giữ nguyên. */
  dropPendingSale: () => void;
};

/** Giỏ lưu quá chừng này (không có lần bán treo) thì bỏ: giá và tồn đã cũ. */
export const CART_TTL_MS = 24 * 60 * 60_000;

export const cartKey = (scope: string) => `${PrefKeys.posCart}.${scope}`;

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function isLine(v: any): v is CartLine {
  return (
    !!v &&
    str(v.key) &&
    str(v.productId) &&
    (v.variantId === undefined || str(v.variantId)) &&
    typeof v.code === 'string' &&
    typeof v.name === 'string' &&
    num(v.listPrice) &&
    num(v.price) &&
    num(v.qty) &&
    v.qty > 0 &&
    num(v.stock)
  );
}

function readPending(v: any): PendingSale | null {
  const r = v?.request;
  if (!r || !str(r.clientRequestId) || !Array.isArray(r.invoiceDetails) || !Array.isArray(r.payments) || !num(r.totalPayment)) return null;
  // App bị tắt lúc đang gửi: không còn gì đang bay → chưa biết kết quả.
  const status = v.status === 'rejected' ? 'rejected' : v.status === 'unknown' || v.status === 'sending' ? 'unknown' : null;
  return status ? { request: r as SaleRequest, status, startedAt: num(v.startedAt) ? v.startedAt : 0 } : null;
}

export function serializeCart(state: Pick<CartState, 'lines' | 'pending'>, now: number): string {
  return JSON.stringify({ v: 1, lines: state.lines, pending: state.pending, savedAt: now });
}

/**
 * Đọc giỏ đã lưu; hỏng / sai dạng → giỏ rỗng. Lần bán chưa biết kết quả luôn được giữ (kèm giỏ của nó) dù lưu
 * đã lâu; giỏ thường quá CART_TTL_MS thì bỏ.
 */
export function parseSavedCart(raw: string | null | undefined, now: number): { lines: CartLine[]; pending: PendingSale | null } {
  const empty = { lines: [], pending: null };
  if (!raw) return empty;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || v.v !== 1) return empty;
    const lines: CartLine[] = Array.isArray(v.lines) ? v.lines.filter(isLine) : [];
    const pending = readPending(v.pending);
    if (pending?.status === 'unknown') return { lines, pending };
    const fresh = num(v.savedAt) && now - v.savedAt <= CART_TTL_MS;
    return fresh ? { lines, pending } : empty;
  } catch {
    return empty;
  }
}

/** Gộp các dòng thêm sau vào giỏ: cùng món thì cộng số lượng. */
export function mergeLines(base: readonly CartLine[], extra: readonly CartLine[]): CartLine[] {
  const out = base.map((l) => ({ ...l }));
  for (const line of extra) {
    const existing = out.find((l) => l.key === line.key);
    if (existing) existing.qty += line.qty;
    else out.push({ ...line });
  }
  return out;
}

/** Ghi giỏ hiện tại xuống máy (giỏ rỗng, không có lần bán treo → xoá khoá). Chưa nạp xong thì chưa ghi. */
function save(state: CartState): Promise<void> {
  if (!state.hydrated || !state.scope) return Promise.resolve();
  const key = cartKey(state.scope);
  const write = state.lines.length || state.pending ? prefs.set(key, serializeCart(state, Date.now())) : prefs.remove(key);
  return write.then(
    () => undefined,
    () => undefined
  );
}

export const useCart = create<CartState>((set, get) => {
  /** Sửa các dòng trong giỏ; giỏ đang khoá thì bỏ qua. */
  const edit = (change: (lines: CartLine[]) => CartLine[]): boolean => {
    const s = get();
    if (isSaleInDoubt(s.pending)) return false;
    set({ lines: change(s.lines) });
    void save(get());
    return true;
  };

  return {
    lines: [],
    pending: null,
    scope: null,
    hydrated: false,

    add: (line) =>
      edit((lines) => {
        const key = line.variantId ?? line.productId;
        const existing = lines.find((l) => l.key === key);
        if (existing) return lines.map((l) => (l.key === key ? { ...l, qty: l.qty + (line.qty ?? 1) } : l));
        return [...lines, { ...line, key, qty: line.qty ?? 1, price: line.listPrice }];
      }),
    setQty: (key, qty) => {
      edit((lines) => (qty <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, qty } : l))));
    },
    setPrice: (key, price) => {
      edit((lines) => lines.map((l) => (l.key === key ? { ...l, price: Math.max(0, price) } : l)));
    },
    remove: (key) => {
      edit((lines) => lines.filter((l) => l.key !== key));
    },
    clear: () => {
      if (isSaleInDoubt(get().pending)) return;
      // Xoá giỏ = bắt đầu lại: lần bán bị từ chối trước đó cũng thôi theo dõi.
      set({ lines: [], pending: null });
      void save(get());
    },

    async hydrate(scope) {
      const s = get();
      if (s.hydrated && s.scope === scope) return;
      // Dòng thêm trước khi nạp xong (mở thẳng trang hàng hoá rồi bấm "Bán món này") được giữ; dòng của cửa hàng khác thì bỏ.
      set({ scope, hydrated: false, pending: null, lines: s.scope === null ? s.lines : [] });
      let raw: string | null = null;
      try {
        raw = await prefs.get(cartKey(scope));
      } catch {
        // Không đọc được → giỏ rỗng.
      }
      if (get().scope !== scope) return; // đã sang cửa hàng khác trong lúc đọc
      const saved = parseSavedCart(raw, Date.now());
      const early = get().lines;
      // Giỏ đã lưu đang khoá (lần bán chưa biết kết quả) thì giữ nguyên đúng giỏ đó.
      const lines = isSaleInDoubt(saved.pending) ? saved.lines : mergeLines(saved.lines, early);
      set({ lines, pending: saved.pending, hydrated: true });
      if (early.length) void save(get());
    },

    async forget(scope) {
      const s = get();
      if (s.scope !== scope) return;
      const keep = isSaleInDoubt(s.pending);
      set({ scope: null, hydrated: false, lines: [], pending: null });
      if (!keep) await prefs.remove(cartKey(scope)).catch(() => {});
    },

    async beginSale(draft) {
      const s = get();
      if (isSaleInDoubt(s.pending)) return (await get().retrySale())!;
      const request: SaleRequest = { ...draft, clientRequestId: requestIdFor(s.pending, draft) };
      set({ pending: { request, status: 'sending', startedAt: Date.now() } });
      await save(get());
      return request;
    },

    async retrySale() {
      const { pending } = get();
      if (!pending) return null;
      set({ pending: { ...pending, status: 'sending' } });
      await save(get());
      return pending.request;
    },

    settleSale(clientRequestId, outcome) {
      const { pending } = get();
      if (!pending || pending.request.clientRequestId !== clientRequestId) return;
      if (outcome === 'created') set({ lines: [], pending: null });
      else set({ pending: { ...pending, status: outcome } });
      void save(get());
    },

    dropPendingSale() {
      if (!get().pending) return;
      set({ pending: null });
      void save(get());
    },
  };
});

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
