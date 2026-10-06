import Constants from 'expo-constants';
import { create } from 'zustand';

import { toast } from 'src/components/overlay';
import { getFnbOrder } from 'src/api/fnb';
import { t } from 'src/i18n';
import type { IFnbFloor, IKitchenTicket, IOpenOrder, IUnprintedTicket } from 'src/types/fnb';

import type { DraftLine } from './draft';
import { printResultCmd } from './fnb-commands';
import { FnbCodes } from './fnb-errors';
import { currentDeviceId } from './fnb-ids';
import { printFnbDocument, type FnbPrintJob } from './fnb-print';
import { applyOrdersToFloor } from './floor';
import { fnbQueue, type QueueEntry, type QueueInput } from './write-queue';

// ----------------------------------------------------------------------
// Dữ liệu F&B đang giữ trên máy: đơn (theo id), phiếu bar, sơ đồ bàn theo chi nhánh, món đang chọn theo đơn.
// Luật thay (contract 1.6, 7): đơn đến có version >= bản đang giữ thì thay; phiếu đến có updatedAt >= thì thay.
// Kết quả của hàng đợi ghi được nối vào đây (bindQueue): lưu đơn / phiếu, in phiếu bar mới qua điểm in duy nhất
// rồi báo kết quả in, 409 → tải lại đơn.
// ----------------------------------------------------------------------

export function newerOrder(local: IOpenOrder | undefined, incoming: IOpenOrder): boolean {
  return !local || incoming.version >= local.version;
}

export function newerTicket(local: IKitchenTicket | undefined, incoming: IKitchenTicket): boolean {
  return !local || incoming.updatedAt >= local.updatedAt;
}

/** Cập nhật danh sách phiếu chưa in của sơ đồ theo phiếu mới nhận. */
export function applyTicketsToUnprinted(list: readonly IUnprintedTicket[], tickets: readonly IKitchenTicket[], branchId: string): IUnprintedTicket[] {
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const tk of tickets) {
    if (tk.branchId !== branchId) continue;
    if (tk.printStatus === 'Pending' || tk.printStatus === 'Failed') {
      byId.set(tk.id, { id: tk.id, orderId: tk.orderId, kind: tk.kind, printStatus: tk.printStatus, createdAt: tk.createdAt, claimExpiresAt: tk.claimExpiresAt });
    } else {
      byId.delete(tk.id);
    }
  }
  return [...byId.values()];
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object';

/**
 * Hệ quả của một lệnh đã thành công: đơn / phiếu cần lưu và giấy cần in.
 *   - phiếu bar mới (Order / Void) còn chờ in và máy này chưa in → in rồi báo kết quả;
 *   - tạm tính → in "TẠM TÍNH" (gửi lại trùng thì không in lần nữa);
 *   - thanh toán xong → in phiếu thanh toán.
 */
export function commandEffects(entry: Pick<QueueEntry, 'kind'>, data: unknown, printed: ReadonlySet<string>) {
  const orders: IOpenOrder[] = [];
  const tickets: IKitchenTicket[] = [];
  const prints: FnbPrintJob[] = [];
  if (!isObj(data)) return { orders, tickets, prints };
  const order = isObj(data.order) && typeof data.order.id === 'string' ? (data.order as IOpenOrder) : null;
  if (order) orders.push(order);
  if (isObj(data.otherOrder) && typeof data.otherOrder.id === 'string') orders.push(data.otherOrder as IOpenOrder);
  const ticket = isObj(data.ticket) && typeof data.ticket.id === 'string' ? (data.ticket as IKitchenTicket) : null;
  if (ticket) {
    tickets.push(ticket);
    if (entry.kind !== 'printResult' && !printed.has(ticket.id) && (ticket.printStatus === 'Pending' || ticket.printStatus === 'Failed')) {
      prints.push({ kind: 'kitchenTicket', ticket });
    }
  }
  const replayed = data.replayed === true;
  if (order && !replayed && entry.kind === 'bill') prints.push({ kind: 'provisionalBill', order });
  if (order && !replayed && entry.kind === 'checkout' && order.status === 'Paid') prints.push({ kind: 'receipt', order });
  return { orders, tickets, prints };
}

type FnbState = {
  orders: Record<string, IOpenOrder>;
  tickets: Record<string, IKitchenTicket>;
  floors: Record<string, IFnbFloor>;
  drafts: Record<string, DraftLine[]>;
  applyOrders: (orders: readonly IOpenOrder[]) => void;
  applyTickets: (tickets: readonly IKitchenTicket[]) => void;
  setFloor: (floor: IFnbFloor) => void;
  setDraft: (orderId: string, lines: DraftLine[]) => void;
  reset: () => void;
};

export const useFnb = create<FnbState>((set) => ({
  orders: {},
  tickets: {},
  floors: {},
  drafts: {},

  applyOrders(incoming) {
    if (incoming.length === 0) return;
    set((s) => {
      const orders = { ...s.orders };
      for (const o of incoming) if (newerOrder(orders[o.id], o)) orders[o.id] = o;
      const floors = { ...s.floors };
      for (const id of Object.keys(floors)) floors[id] = applyOrdersToFloor(floors[id]!, incoming);
      return { orders, floors };
    });
  },

  applyTickets(incoming) {
    if (incoming.length === 0) return;
    set((s) => {
      const tickets = { ...s.tickets };
      for (const tk of incoming) if (newerTicket(tickets[tk.id], tk)) tickets[tk.id] = tk;
      const floors = { ...s.floors };
      for (const [id, f] of Object.entries(floors)) floors[id] = { ...f, unprintedTickets: applyTicketsToUnprinted(f.unprintedTickets, incoming, id) };
      return { tickets, floors };
    });
  },

  setFloor(floor) {
    // Đơn đang giữ mới hơn ảnh chụp (vừa ghi xong mà sơ đồ tải trước đó) vẫn được giữ.
    set((s) => ({ floors: { ...s.floors, [floor.branchId]: applyOrdersToFloor(floor, Object.values(s.orders)) } }));
  },

  setDraft(orderId, lines) {
    set((s) => {
      const drafts = { ...s.drafts };
      if (lines.length) drafts[orderId] = lines;
      else delete drafts[orderId];
      return { drafts };
    });
  },

  reset() {
    set({ orders: {}, tickets: {}, floors: {}, drafts: {} });
  },
}));

// ── Ghi: xếp lệnh vào hàng đợi ──────────────────────────────────────────

/** Xếp một lệnh ghi (mọi màn F&B gọi qua đây). */
export function enqueueFnb(input: QueueInput): Promise<string> {
  return fnbQueue.enqueue(input);
}

export const commandCtx = () => ({ deviceId: currentDeviceId() });

const deviceName = () => (Constants.deviceName || 'Spark Store').slice(0, 100);

// ── Nối kết quả hàng đợi ────────────────────────────────────────────────

const printedTickets = new Set<string>();

async function runPrints(jobs: FnbPrintJob[]) {
  for (const job of jobs) {
    if (job.kind === 'kitchenTicket') printedTickets.add(job.ticket.id);
    let res: Awaited<ReturnType<typeof printFnbDocument>>;
    try {
      res = await printFnbDocument(job);
    } catch (e) {
      res = { result: 'Failed', error: e instanceof Error ? e.message : String(e) };
    }
    if (job.kind === 'kitchenTicket') {
      await enqueueFnb(
        printResultCmd({ ...commandCtx(), deviceName: deviceName() }, job.ticket, {
          result: res.result,
          error: res.error?.slice(0, 255) ?? null,
          reprint: !!job.reprint,
        })
      );
    }
  }
}

async function reloadOrder(orderId: string) {
  try {
    useFnb.getState().applyOrders([await getFnbOrder(orderId)]);
  } catch {
    // Mất mạng: lần đồng bộ sau sẽ mang bản mới về.
  }
}

let bound = false;

/** Nối hàng đợi ghi với dữ liệu trên máy — gọi một lần khi app khởi động phần F&B. */
export function bindQueue() {
  if (bound) return;
  bound = true;
  fnbQueue.setHandlers({
    onDone(entry, data) {
      const fx = commandEffects(entry, data, printedTickets);
      useFnb.getState().applyOrders(fx.orders);
      useFnb.getState().applyTickets(fx.tickets);
      if (fx.prints.length) void runPrints(fx.prints);
    },
    onConflict(entry, problem) {
      const known = [problem.order, problem.otherOrder].filter((o): o is IOpenOrder => !!o);
      if (known.length) useFnb.getState().applyOrders(known);
      else void reloadOrder(entry.orderIds[0]!);
      if (problem.code === FnbCodes.versionConflict) toast.warning(t('fnb.reloaded'));
    },
    onAttention(_entry, problem) {
      toast.error(problem.title || t('fnb.commandFailed'));
    },
  });
}
