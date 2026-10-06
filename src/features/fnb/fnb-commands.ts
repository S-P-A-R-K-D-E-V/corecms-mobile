import { endpoints } from 'src/api/axios';
import type { FnbPaymentMethod, IOpenOrder } from 'src/types/fnb';

import { isoNow, newId } from './fnb-ids';
import type { QueueInput } from './write-queue';

// ----------------------------------------------------------------------
// Dựng lệnh ghi lên đơn (contract 5.x, 6.4) thành mục hàng đợi. Mọi id (đơn, dòng, phiếu, clientRequestId) sinh
// trên máy NGAY LÚC DỰNG — gửi lại bao nhiêu lần cũng là cùng một gói. Lệnh "versioned" mang baseVersion của bản
// đơn đang hiện trên máy.
// ----------------------------------------------------------------------

export type Envelope = { clientRequestId: string; deviceId: string; clientTime: string };

export type CommandCtx = { deviceId: string; now?: Date };

function envelope(ctx: CommandCtx): Envelope {
  return { clientRequestId: newId(), deviceId: ctx.deviceId, clientTime: isoNow(ctx.now) };
}

// ── Dòng món gửi lên ────────────────────────────────────────────────────

export type ItemLineInput = {
  id: string;
  lineType: 'Item';
  productId: string;
  quantity: number;
  toppings: { productId: string; quantity: number }[];
  quickNotes: string[];
  note: string | null;
};

export type OpenItemLineInput = {
  id: string;
  lineType: 'OpenItem';
  name: string;
  unitPrice: number;
  quantity: number;
  note: string | null;
};

export type LineInput = ItemLineInput | OpenItemLineInput;

// ── Lệnh ────────────────────────────────────────────────────────────────

/** 5.1 Mở đơn (id đơn do máy sinh). `tableId: null` = mang về. */
export function openOrderCmd(
  ctx: CommandCtx,
  input: { orderId: string; branchId: string; tableId: string | null; guestCount?: number | null; allowSharedTable?: boolean }
): QueueInput {
  return {
    kind: 'open',
    orderIds: [input.orderId],
    method: 'PUT',
    path: endpoints.fnb.order(input.orderId),
    body: {
      ...envelope(ctx),
      branchId: input.branchId,
      tableId: input.tableId,
      guestCount: input.guestCount ?? null,
      customerId: null,
      note: null,
      clientOrderNo: null,
      allowSharedTable: !!input.allowSharedTable,
    },
  };
}

/** 5.5 Thêm dòng; có `sendTicketId` thì gửi bar luôn (một phiếu cho đúng các dòng này). */
export function addLinesCmd(ctx: CommandCtx, orderId: string, lines: LineInput[], sendTicketId: string | null): QueueInput {
  return {
    kind: 'addLines',
    orderIds: [orderId],
    method: 'POST',
    path: endpoints.fnb.orderLines(orderId),
    body: { ...envelope(ctx), lines, send: sendTicketId ? { ticketId: sendTicketId } : null },
  };
}

/** 5.6 Bỏ một dòng chưa gửi (quantity 0, giữ nguyên các trường khác của dòng). */
export function removePendingLineCmd(ctx: CommandCtx, orderId: string, line: IOpenOrder['lines'][number]): QueueInput {
  const fields =
    line.lineType === 'OpenItem'
      ? { name: line.name, unitPrice: line.unitPrice, quantity: 0, note: line.note }
      : {
          productId: line.productId,
          quantity: 0,
          toppings: line.toppings.map((t) => ({ productId: t.productId, quantity: t.quantity })),
          quickNotes: line.quickNotes,
          note: line.note,
        };
  return {
    kind: 'replaceLine',
    orderIds: [orderId],
    method: 'PUT',
    path: endpoints.fnb.orderLine(orderId, line.id),
    body: { ...envelope(ctx), ...fields },
  };
}

/** 5.7 Gửi bar các dòng đang giữ (`lineIds: null` = tất cả). */
export function sendCmd(ctx: CommandCtx, orderId: string, ticketId: string, lineIds: string[] | null = null): QueueInput {
  return {
    kind: 'send',
    orderIds: [orderId],
    method: 'POST',
    path: endpoints.fnb.orderSend(orderId),
    body: { ...envelope(ctx), ticketId, lineIds },
  };
}

/** 5.8 Huỷ món đã gửi — bắt buộc lý do; tạo phiếu "HỦY". */
export function voidCmd(
  ctx: CommandCtx,
  order: Pick<IOpenOrder, 'id' | 'version'>,
  input: { reason: string; alreadyMade: boolean; lines: { lineId: string; quantity: number }[] }
): QueueInput {
  return {
    kind: 'void',
    orderIds: [order.id],
    method: 'POST',
    path: endpoints.fnb.orderVoid(order.id),
    body: {
      ...envelope(ctx),
      baseVersion: order.version,
      ticketId: newId(),
      reason: input.reason.trim(),
      alreadyMade: input.alreadyMade,
      lines: input.lines,
    },
  };
}

export type MoveTarget =
  | { kind: 'existing'; orderId: string }
  | { kind: 'create'; orderId: string; tableId: string | null; guestCount?: number | null };

/** 5.9 Chuyển món (đổi bàn / gộp / tách). Dòng chuyển một phần cần `newLineId` do máy sinh. */
export function moveCmd(
  ctx: CommandCtx,
  source: Pick<IOpenOrder, 'id' | 'version'>,
  target: MoveTarget,
  lines: { lineId: string; quantity: number; newLineId: string | null }[]
): QueueInput {
  return {
    kind: 'move',
    orderIds: [source.id, target.orderId],
    method: 'POST',
    path: endpoints.fnb.orderMove(source.id),
    body: {
      ...envelope(ctx),
      baseVersion: source.version,
      target: {
        orderId: target.orderId,
        create:
          target.kind === 'create' ? { tableId: target.tableId, guestCount: target.guestCount ?? null, clientOrderNo: null } : null,
      },
      lines,
    },
  };
}

/** 5.12 Tạm tính. */
export function billCmd(ctx: CommandCtx, order: Pick<IOpenOrder, 'id' | 'version'>): QueueInput {
  return {
    kind: 'bill',
    orderIds: [order.id],
    method: 'POST',
    path: endpoints.fnb.orderBill(order.id),
    body: { ...envelope(ctx), baseVersion: order.version },
  };
}

export type CheckoutPayment = { method: FnbPaymentMethod; amount: number; bankAccountId: string | null; transactionRef: string | null };

/** 5.13 Thanh toán và đóng đơn. Còn dòng đang giữ thì gửi bar luôn trong cùng lệnh (`sendTicketId`). */
export function checkoutCmd(
  ctx: CommandCtx,
  order: Pick<IOpenOrder, 'id' | 'version'>,
  input: { expectedTotal: number; payments: CheckoutPayment[]; cashTendered: number | null; sendPending: boolean }
): QueueInput {
  return {
    kind: 'checkout',
    orderIds: [order.id],
    method: 'POST',
    path: endpoints.fnb.orderCheckout(order.id),
    body: {
      ...envelope(ctx),
      baseVersion: order.version,
      expectedTotal: input.expectedTotal,
      payments: input.payments,
      cashTendered: input.cashTendered,
      sendTicketId: input.sendPending ? newId() : null,
    },
  };
}

/** 5.14 Huỷ cả đơn. Có món đã gửi thì cần lý do + phiếu "HỦY". */
export function cancelCmd(
  ctx: CommandCtx,
  order: Pick<IOpenOrder, 'id' | 'version'>,
  input: { hasSentLines: boolean; reason: string | null; alreadyMade: boolean }
): QueueInput {
  return {
    kind: 'cancel',
    orderIds: [order.id],
    method: 'POST',
    path: endpoints.fnb.orderCancel(order.id),
    body: {
      ...envelope(ctx),
      baseVersion: order.version,
      reason: input.reason?.trim() || null,
      alreadyMade: input.alreadyMade,
      ticketId: input.hasSentLines ? newId() : null,
    },
  };
}

/** 6.4 Báo kết quả in phiếu bar. Xếp chung hàng với đơn của phiếu (phiếu được tạo trước bởi lệnh của đơn). */
export function printResultCmd(
  ctx: CommandCtx & { deviceName: string },
  ticket: { id: string; orderId: string },
  input: { result: 'Printed' | 'Failed' | 'Skipped'; error?: string | null; reprint?: boolean }
): QueueInput {
  return {
    kind: 'printResult',
    orderIds: [ticket.orderId],
    method: 'POST',
    path: endpoints.fnb.ticketPrintResult(ticket.id),
    body: {
      ...envelope(ctx),
      deviceName: ctx.deviceName,
      result: input.result,
      error: input.error ?? null,
      reprint: !!input.reprint,
    },
  };
}
