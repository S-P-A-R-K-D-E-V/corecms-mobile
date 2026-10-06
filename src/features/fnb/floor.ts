import type { IFloorArea, IFloorTable, IFnbFloor, IOpenOrder, IOrderSummary, IUnprintedTicket } from 'src/types/fnb';

// ----------------------------------------------------------------------
// Sơ đồ bàn (contract 4.3, 7): trạng thái bàn suy ra từ các đơn đang mở; đơn mới nhận qua /fnb/sync hoặc từ kết
// quả lệnh ghi được áp vào ảnh chụp sơ đồ theo luật phiên bản (bản đến có version >= bản đang giữ thì thay).
// ----------------------------------------------------------------------

export type TableStatus = 'free' | 'occupied' | 'billed';

/** Không đơn = trống; có đơn = có khách; có đơn đã in tạm tính = chờ thanh toán. */
export function tableStatus(table: Pick<IFloorTable, 'orders'>): TableStatus {
  if (table.orders.length === 0) return 'free';
  return table.orders.some((o) => o.billPrinted) ? 'billed' : 'occupied';
}

export function summaryOf(order: IOpenOrder): IOrderSummary {
  const t = order.totals;
  return {
    id: order.id,
    version: order.version,
    status: order.status,
    branchId: order.branchId,
    tableId: order.tableId,
    displayNo: order.displayNo,
    guestCount: order.guestCount,
    itemCount: t.itemCount,
    pendingLineCount: order.lines.filter((l) => l.status === 'Pending' && l.quantity > 0).length,
    total: t.total,
    billPrinted: !!order.bill,
    openedAt: order.openedAt,
    updatedAt: order.updatedAt,
    openedByName: order.openedByName,
  };
}

const sortByOpened = (a: IOrderSummary, b: IOrderSummary) => a.openedAt.localeCompare(b.openedAt);

/** Áp các đơn mới nhận vào sơ đồ: đơn Open nằm ở bàn của nó (hoặc mang về), đơn đã đóng biến mất. */
export function applyOrdersToFloor(floor: IFnbFloor, orders: readonly IOpenOrder[]): IFnbFloor {
  if (orders.length === 0) return floor;
  const current = new Map<string, IOrderSummary>();
  for (const a of floor.areas) for (const t of a.tables) for (const o of t.orders) current.set(o.id, o);
  for (const o of floor.takeawayOrders) current.set(o.id, o);

  const incoming = new Map<string, IOpenOrder>();
  for (const o of orders) {
    if (o.branchId !== floor.branchId) continue;
    const had = current.get(o.id);
    if (had && o.version < had.version) continue;
    const prev = incoming.get(o.id);
    if (!prev || o.version >= prev.version) incoming.set(o.id, o);
  }
  if (incoming.size === 0) return floor;

  const placed = (tableId: string | null) =>
    [...incoming.values()].filter((o) => o.status === 'Open' && o.tableId === tableId).map(summaryOf);
  const keep = (list: IOrderSummary[]) => list.filter((o) => !incoming.has(o.id));

  const areas: IFloorArea[] = floor.areas.map((a) => ({
    ...a,
    tables: a.tables.map((t) => ({ ...t, orders: [...keep(t.orders), ...placed(t.id)].sort(sortByOpened) })),
  }));
  return { ...floor, areas, takeawayOrders: [...keep(floor.takeawayOrders), ...placed(null)].sort(sortByOpened) };
}

/** Bàn của một khu vực (null = mọi khu vực), theo thứ tự hiển thị. */
export function tablesOf(floor: IFnbFloor | null | undefined, areaId: string | null): (IFloorTable & { areaName: string })[] {
  if (!floor) return [];
  return [...floor.areas]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'vi'))
    .filter((a) => !areaId || a.id === areaId)
    .flatMap((a) =>
      [...a.tables]
        .sort((x, y) => x.sortOrder - y.sortOrder || x.name.localeCompare(y.name, 'vi'))
        .map((t) => ({ ...t, areaName: a.name }))
    );
}

/** Tìm bàn theo id. */
export function findTable(floor: IFnbFloor | null | undefined, tableId: string | null) {
  if (!floor || !tableId) return null;
  for (const a of floor.areas) {
    const t = a.tables.find((x) => x.id === tableId);
    if (t) return { ...t, areaName: a.name };
  }
  return null;
}

/** Phiếu bar chưa in quá 30 giây — mọi máy của chi nhánh hiện cảnh báo (contract 6.1). */
export function staleUnprinted(tickets: readonly IUnprintedTicket[], now: number, ageMs = 30_000): IUnprintedTicket[] {
  return tickets.filter(
    (t) => (t.printStatus === 'Pending' || t.printStatus === 'Failed') && now - Date.parse(t.createdAt) >= ageMs
  );
}

/** Số phút từ lúc mở đơn. */
export function minutesSince(iso: string, now: number): number {
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 60_000)) : 0;
}

/** GET /fnb/areas (đã có trên máy chủ) → sơ đồ không có đơn — dùng khi máy chủ chưa có GET /fnb/floor. */
export function floorFromAreas(
  branchId: string,
  areas: { id: string; name: string; sortOrder: number; isActive: boolean; tables?: { id: string; name: string; seats: number | null; sortOrder: number; isActive: boolean }[] }[]
): IFnbFloor {
  return {
    branchId,
    serverTime: new Date().toISOString(),
    cursor: '',
    menuVersion: '',
    tablesVersion: '',
    areas: areas
      .filter((a) => a.isActive)
      .map((a) => ({
        id: a.id,
        name: a.name,
        sortOrder: a.sortOrder,
        tables: (a.tables ?? []).filter((t) => t.isActive).map((t) => ({ ...t, orders: [] })),
      })),
    takeawayOrders: [],
    unprintedTickets: [],
  };
}

export type MoveOption =
  | { key: string; kind: 'existing'; orderId: string; tableId: string | null; tableName: string | null; displayNo: string }
  | { key: string; kind: 'create'; tableId: string | null; tableName: string | null };

/**
 * Nơi chuyển món tới (contract 5.9): bàn trống → mở đơn mới ở bàn đó; bàn đang có đơn → gộp vào từng đơn đang mở
 * (hoặc mở thêm đơn mới ở bàn đó để tách); mang về → đơn mới hoặc đơn mang về đang mở. Không gồm đơn nguồn.
 */
export function moveOptions(floor: IFnbFloor | null | undefined, sourceOrderId: string): MoveOption[] {
  const out: MoveOption[] = [];
  for (const table of tablesOf(floor, null)) {
    const others = table.orders.filter((o) => o.id !== sourceOrderId);
    for (const o of others) {
      out.push({ key: `o:${o.id}`, kind: 'existing', orderId: o.id, tableId: table.id, tableName: table.name, displayNo: o.displayNo });
    }
    out.push({ key: `t:${table.id}`, kind: 'create', tableId: table.id, tableName: table.name });
  }
  for (const o of floor?.takeawayOrders ?? []) {
    if (o.id !== sourceOrderId) out.push({ key: `o:${o.id}`, kind: 'existing', orderId: o.id, tableId: null, tableName: null, displayNo: o.displayNo });
  }
  out.push({ key: 't:takeaway', kind: 'create', tableId: null, tableName: null });
  return out;
}
