import type { IFnbStockCount, IFnbStockCountLine } from 'src/types/fnb';

import { parseQuantity } from './batch';
import { normalizeVi } from './menu';

// ----------------------------------------------------------------------
// Kiểm kho nguyên liệu trên app — theo phiếu kiểm của máy chủ (core-be /fnb/stock-counts): phiếu nháp lưu trên máy chủ,
// nhiều người đếm song song theo dòng; mỗi dòng nhập số đếm theo đơn vị gốc hoặc một đơn vị mua. Nhân viên đếm mù (không
// thấy số hệ thống). Nộp phiếu → quản lý duyệt chênh lệch ở trang web.
// ----------------------------------------------------------------------

/** Số đang nhập của một dòng: chữ trong ô + đơn vị (null = đơn vị gốc). */
export type CountEdit = { quantity: string; unitId: string | null };

export type CountEdits = Record<string, CountEdit>;

/** Một dòng sẵn sàng gửi: parts rỗng = xoá số đếm của dòng. */
export type CountEntry = { lineId: string; parts: { unitId: string | null; quantity: number }[] };

/** Các dòng đã sửa và hợp lệ để gửi PUT …/counts (ô trống = xoá số đếm; chữ không phải số thì bỏ qua). */
export function toEntries(edits: CountEdits): CountEntry[] {
  return Object.entries(edits).flatMap(([lineId, edit]) => {
    if (edit.quantity.trim() === '') return [{ lineId, parts: [] }];
    const quantity = parseQuantity(edit.quantity);
    return quantity == null || quantity < 0 ? [] : [{ lineId, parts: [{ unitId: edit.unitId, quantity }] }];
  });
}

/** Có ô đang nhập sai (không phải số, hoặc âm). */
export const hasInvalidEdit = (edits: CountEdits) =>
  Object.values(edits).some((e) => {
    if (e.quantity.trim() === '') return false;
    const quantity = parseQuantity(e.quantity);
    return quantity == null || quantity < 0;
  });

/** Dòng coi như đã đếm: đang nhập số hợp lệ, hoặc máy chủ đã có số đếm và chưa bị xoá trên máy. */
export function isCounted(line: IFnbStockCountLine, edits: CountEdits): boolean {
  const edit = edits[line.lineId];
  if (!edit) return line.isCounted;
  const quantity = parseQuantity(edit.quantity);
  return quantity != null && quantity >= 0;
}

export function progress(count: Pick<IFnbStockCount, 'lines'>, edits: CountEdits): { counted: number; total: number } {
  const lines = count.lines ?? [];
  return { counted: lines.filter((l) => isCounted(l, edits)).length, total: lines.length };
}

/** Lọc dòng theo chữ tìm (bỏ dấu) và "chỉ dòng chưa đếm". */
export function visibleLines(
  count: Pick<IFnbStockCount, 'lines'>,
  edits: CountEdits,
  keyword: string,
  onlyUncounted: boolean
): IFnbStockCountLine[] {
  const kw = normalizeVi(keyword);
  return (count.lines ?? []).filter(
    (l) =>
      (!kw || normalizeVi(l.productName).includes(kw) || normalizeVi(l.productCode).includes(kw)) &&
      (!onlyUncounted || !isCounted(l, edits))
  );
}

/** Chữ hiện trong ô của một dòng: số đang nhập, không thì số đã lưu trên máy chủ. */
export const shownQuantity = (line: IFnbStockCountLine, edits: CountEdits): string =>
  edits[line.lineId]?.quantity ?? (line.isCounted && line.countedQuantity != null ? String(line.countedQuantity).replace('.', ',') : '');
