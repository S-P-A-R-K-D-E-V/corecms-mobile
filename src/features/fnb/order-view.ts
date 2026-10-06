import type { IOpenOrder, IOrderLine } from 'src/types/fnb';

import { newId } from './fnb-ids';
import type { DraftLine } from './draft';
import type { QueueEntry } from './write-queue';

// ----------------------------------------------------------------------
// Đọc đơn để hiện: dòng theo lượt gửi bar, dòng đang giữ, dòng huỷ được / chuyển được, và các lệnh còn trong
// hàng đợi của đơn. Chọn số lượng huỷ / chuyển → dòng gửi lên (chuyển một phần cần id dòng mới do máy sinh).
// ----------------------------------------------------------------------

/** Dòng còn tính tiền. */
export const isActiveLine = (l: IOrderLine) => l.quantity > 0 && (l.status === 'Pending' || l.status === 'Sent');

export const pendingLines = (order: IOpenOrder | null | undefined) =>
  (order?.lines ?? []).filter((l) => l.status === 'Pending' && l.quantity > 0);

export const voidableLines = (order: IOpenOrder | null | undefined) =>
  (order?.lines ?? []).filter((l) => l.status === 'Sent' && l.quantity > 0);

export const movableLines = (order: IOpenOrder | null | undefined) => (order?.lines ?? []).filter(isActiveLine);

export type Round = { ticketId: string; no: number; sentAt: string | null; lines: IOrderLine[] };

/**
 * Các lượt đã gửi bar theo thứ tự gửi: nhóm dòng Sent / Voided theo phiếu (`ticketId`), đánh số 1, 2, 3… theo
 * lần đầu xuất hiện (dòng xếp theo seq). Dòng chuyển từ đơn khác giữ phiếu cũ nên thành lượt riêng.
 */
export function roundsOf(order: IOpenOrder | null | undefined): Round[] {
  const rounds: Round[] = [];
  const byTicket = new Map<string, Round>();
  const lines = [...(order?.lines ?? [])].sort((a, b) => a.seq - b.seq);
  for (const line of lines) {
    if ((line.status !== 'Sent' && line.status !== 'Voided') || !line.ticketId) continue;
    let round = byTicket.get(line.ticketId);
    if (!round) {
      round = { ticketId: line.ticketId, no: rounds.length + 1, sentAt: line.sentAt, lines: [] };
      byTicket.set(line.ticketId, round);
      rounds.push(round);
    }
    round.lines.push(line);
  }
  return rounds;
}

/** Tạm tính đã in nhưng tổng tiền đã đổi sau đó. */
export const billOutdated = (order: IOpenOrder | null | undefined) =>
  !!order?.bill && order.bill.lastTotal !== order.totals.total;

/** Đơn còn lệnh trong hàng đợi (đang gửi hoặc cần xử lý). */
export const entriesOf = (entries: readonly QueueEntry[], orderId: string) => entries.filter((e) => e.orderIds.includes(orderId));

/**
 * Lệnh có kiểm phiên bản (huỷ món, chuyển, tạm tính, thanh toán, huỷ đơn) chỉ dựng khi đơn đã đồng bộ xong: còn
 * lệnh trước chưa gửi thì baseVersion trên máy chắc chắn cũ → máy chủ sẽ trả 409.
 */
export function canRunVersioned(order: IOpenOrder | null | undefined, entries: readonly QueueEntry[]): boolean {
  return !!order && order.status === 'Open' && entriesOf(entries, order.id).length === 0;
}

/** Dòng "đang gửi" của đơn: các lệnh thêm món còn trong hàng đợi (chưa có trả lời). */
export function outboxLines(entries: readonly QueueEntry[], orderId: string) {
  return entriesOf(entries, orderId)
    .filter((e) => e.kind === 'addLines' && e.orderIds[0] === orderId)
    .flatMap((e) => (e.preview?.drafts ?? []).map((d) => ({ draft: d, state: e.state })));
}

/** Món của các lệnh thêm món đang "cần xử lý" — trả lại thành món đang chọn (id dòng mới) khi người dùng bỏ lệnh. */
export function draftsToRestore(entries: readonly QueueEntry[], orderId: string, makeId: () => string = newId): DraftLine[] {
  return entriesOf(entries, orderId)
    .filter((e) => e.state === 'attention' && e.kind === 'addLines' && e.orderIds[0] === orderId)
    .flatMap((e) => (e.preview?.drafts ?? []).map((d) => ({ ...d, id: makeId() })));
}

/** Đơn chưa có trên máy chủ (lệnh mở đơn còn trong hàng đợi). */
export const isUnsyncedNew = (entries: readonly QueueEntry[], orderId: string) =>
  entries.some((e) => e.kind === 'open' && e.orderIds[0] === orderId);

export type QtySelection = Record<string, number>;

/** Dòng huỷ: chỉ dòng đã gửi, số lượng 1..quantity. */
export function voidSelection(order: IOpenOrder, sel: QtySelection): { lineId: string; quantity: number }[] {
  return voidableLines(order)
    .map((l) => ({ lineId: l.id, quantity: Math.min(l.quantity, Math.max(0, Math.round(sel[l.id] ?? 0))) }))
    .filter((x) => x.quantity > 0);
}

/** Dòng chuyển: cả dòng thì `newLineId: null`; chuyển một phần thì sinh id dòng mới cho đơn đích. */
export function moveSelection(
  order: IOpenOrder,
  sel: QtySelection,
  makeId: () => string = newId
): { lineId: string; quantity: number; newLineId: string | null }[] {
  return movableLines(order)
    .map((l) => {
      const quantity = Math.min(l.quantity, Math.max(0, Math.round(sel[l.id] ?? 0)));
      return { lineId: l.id, quantity, newLineId: quantity > 0 && quantity < l.quantity ? makeId() : null };
    })
    .filter((x) => x.quantity > 0);
}

/** Chuyển hết mọi dòng còn tính tiền (đổi bàn / gộp). */
export function allLinesSelection(order: IOpenOrder): QtySelection {
  return Object.fromEntries(movableLines(order).map((l) => [l.id, l.quantity]));
}

/** Mô tả ngắn một dòng: "Cà phê sữa (L)". */
export const lineTitle = (l: { name: string; variantName: string | null }) => (l.variantName ? `${l.name} (${l.variantName})` : l.name);
