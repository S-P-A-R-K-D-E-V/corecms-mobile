let mockN = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `ID-${++mockN}` }));
jest.mock('src/api/axios', () => ({ __esModule: true, default: {}, endpoints: { fnb: {} } }));
jest.mock('src/api/fnb', () => ({ getFnbOrder: jest.fn() }));

import type { IFnbFloor, IFnbMenu, IKitchenTicket, IMenuDish } from 'src/types/fnb';

import { checkoutPlan } from '../checkout-plan';
import { addDraft, draftAmount, draftTotal, itemDraft, openItemDraft, setDraftQty, toLineInput } from '../draft';
import { problemCode, readProblem } from '../fnb-errors';
import { gridColumns, orderPaneWidth, tileWidth } from '../fnb-layout';
import { applyTicketsToUnprinted, commandEffects, newerOrder, newerTicket } from '../fnb-store';
import { readFloorResponse, readSyncResponse } from '../fnb-sync';
import { applyOrdersToFloor, floorFromAreas, minutesSince, moveOptions, staleUnprinted, summaryOf, tableStatus, tablesOf } from '../floor';
import { allowedToppings, defaultVariant, dishNeedsOptions, filterDishes, normalizeVi, quickNotesFor, sortedCategories } from '../menu';
import {
  billOutdated,
  canRunVersioned,
  draftsToRestore,
  moveSelection,
  outboxLines,
  roundsOf,
  voidSelection,
} from '../order-view';
import { appendEntry, settleEntries, type QueueEntry } from '../write-queue';
import { line, order } from '../__fixtures__/orders';

beforeEach(() => {
  mockN = 0;
});

// ── Thực đơn ────────────────────────────────────────────────────────────

const dish = (p: Partial<IMenuDish> & { id: string }): IMenuDish => ({
  categoryId: 'c-cafe',
  code: 'CF',
  name: 'Cà phê',
  imageUrl: null,
  sortOrder: 1,
  isSoldOut: false,
  priceFrom: 29000,
  variants: [{ productId: p.id, name: null, price: 29000, isSoldOut: false, sortOrder: 1 }],
  toppingIds: [],
  ...p,
});

const menu: IFnbMenu = {
  branchId: 'b-1',
  menuVersion: 'm-1',
  generatedAt: '2026-10-06T01:00:00.000Z',
  categories: [
    { id: 'c-drink', name: 'Đồ uống', parentId: null, sortOrder: 1 },
    { id: 'c-cafe', name: 'Cà phê', parentId: 'c-drink', sortOrder: 2 },
    { id: 'c-food', name: 'Đồ ăn', parentId: null, sortOrder: 3 },
  ],
  dishes: [
    dish({
      id: 'd-cfs',
      code: 'CFS',
      name: 'Cà phê sữa',
      sortOrder: 2,
      variants: [
        { productId: 'v-L', name: 'L', price: 35000, isSoldOut: false, sortOrder: 2 },
        { productId: 'v-M', name: 'M', price: 29000, isSoldOut: true, sortOrder: 1 },
      ],
      toppingIds: ['tp-1', 'tp-missing'],
    }),
    dish({ id: 'd-den', code: 'CFD', name: 'Cà phê đen', sortOrder: 1 }),
    dish({ id: 'd-bm', code: 'BM', name: 'Bánh mì', categoryId: 'c-food', sortOrder: 1 }),
  ],
  toppings: [{ productId: 'tp-1', name: 'Trân châu', price: 5000, isSoldOut: false, sortOrder: 1 }],
  quickNotes: [
    { id: 'q-2', text: 'Ít đá', categoryIds: ['c-drink'], sortOrder: 2 },
    { id: 'q-1', text: 'Mang đi', categoryIds: [], sortOrder: 1 },
    { id: 'q-3', text: 'Không hành', categoryIds: ['c-food'], sortOrder: 3 },
  ],
};

describe('thực đơn', () => {
  it('tìm không dấu theo tên / mã, lọc theo nhóm gồm cả nhóm con, xếp theo sortOrder', () => {
    expect(normalizeVi('Cà Phê Đá')).toBe('ca phe da');
    expect(filterDishes(menu, { keyword: 'ca phe' }).map((d) => d.id)).toEqual(['d-den', 'd-cfs']);
    expect(filterDishes(menu, { keyword: 'bm' }).map((d) => d.id)).toEqual(['d-bm']);
    expect(filterDishes(menu, { categoryId: 'c-drink' }).map((d) => d.id)).toEqual(['d-den', 'd-cfs']);
    expect(sortedCategories(menu).map((c) => c.id)).toEqual(['c-drink', 'c-cafe', 'c-food']);
  });

  it('size mặc định là size đầu còn bán; món thêm theo danh sách của món, bỏ id không có trên thực đơn', () => {
    const cfs = menu.dishes[0]!;
    expect(defaultVariant(cfs)?.productId).toBe('v-L');
    expect(defaultVariant({ ...cfs, isSoldOut: true })).toBeNull();
    expect(allowedToppings(menu, cfs).map((t) => t.productId)).toEqual(['tp-1']);
    expect(dishNeedsOptions(menu, cfs)).toBe(true);
    expect(dishNeedsOptions(menu, menu.dishes[1]!)).toBe(false);
  });

  it('ghi chú nhanh: dùng chung + theo nhóm của món hoặc nhóm cha', () => {
    expect(quickNotesFor(menu, menu.dishes[0]!).map((q) => q.text)).toEqual(['Mang đi', 'Ít đá']);
    expect(quickNotesFor(menu, menu.dishes[2]!).map((q) => q.text)).toEqual(['Mang đi', 'Không hành']);
  });
});

// ── Món đang chọn ───────────────────────────────────────────────────────

describe('món đang chọn', () => {
  const cfs = menu.dishes[0]!;
  const L = cfs.variants[0]!;

  it('thành tiền xem trước = SL × (giá + Σ món thêm); gửi lên không kèm giá cho Item', () => {
    const d = itemDraft(cfs, L, { quantity: 2, toppings: [{ productId: 'tp-1', name: 'Trân châu', quantity: 1, unitPrice: 5000 }, { productId: 'x', name: 'x', quantity: 0, unitPrice: 1 }], quickNotes: ['Ít đá'], note: '  ' });
    expect(d).toMatchObject({ id: 'id-1', productId: 'v-L', variantName: 'L', note: null });
    expect(d.toppings).toHaveLength(1);
    expect(draftAmount(d)).toBe(80000);
    expect(toLineInput(d)).toEqual({ id: 'id-1', lineType: 'Item', productId: 'v-L', quantity: 2, toppings: [{ productId: 'tp-1', quantity: 1 }], quickNotes: ['Ít đá'], note: null });
  });

  it('món tự do gửi tên + giá', () => {
    const d = openItemDraft({ name: ' Bánh mì ốp la ', unitPrice: 30000 });
    expect(toLineInput(d)).toEqual({ id: d.id, lineType: 'OpenItem', name: 'Bánh mì ốp la', unitPrice: 30000, quantity: 1, note: null });
  });

  it('bấm lại cùng món cộng số lượng; khác ghi chú thành dòng riêng; SL 0 bỏ dòng', () => {
    let lines = addDraft([], itemDraft(cfs, L));
    lines = addDraft(lines, itemDraft(cfs, L));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(2);
    lines = addDraft(lines, itemDraft(cfs, L, { quickNotes: ['Ít đá'] }));
    lines = addDraft(lines, openItemDraft({ name: 'A', unitPrice: 1000 }));
    lines = addDraft(lines, openItemDraft({ name: 'A', unitPrice: 1000 }));
    expect(lines).toHaveLength(4);
    expect(draftTotal(lines)).toBe(35000 * 3 + 2000);
    expect(setDraftQty(lines, lines[0]!.id, 0)).toHaveLength(3);
  });
});

// ── Đơn theo lượt, huỷ, chuyển ──────────────────────────────────────────

describe('đơn', () => {
  const o = order({
    version: 3,
    lines: [
      line({ id: 'l-3', seq: 3, ticketId: 'tk-2', sentAt: '2026-10-06T08:30:00.000Z' }),
      line({ id: 'l-1', seq: 1, ticketId: 'tk-1', quantity: 2 }),
      line({ id: 'l-2', seq: 2, ticketId: 'tk-1', status: 'Voided', quantity: 0, voidedQuantity: 1 }),
      line({ id: 'l-4', seq: 4, status: 'Pending', ticketId: null, sentAt: null }),
      line({ id: 'l-5', seq: 5, status: 'Removed', quantity: 0, ticketId: null }),
    ],
    totals: { itemCount: 4, subtotal: 120000, discountAmount: 0, total: 120000 },
  });

  it('nhóm dòng đã gửi theo phiếu bar, đánh số lượt theo thứ tự gửi', () => {
    const rounds = roundsOf(o);
    expect(rounds.map((r) => [r.no, r.ticketId, r.lines.map((l) => l.id)])).toEqual([
      [1, 'tk-1', ['l-1', 'l-2']],
      [2, 'tk-2', ['l-3']],
    ]);
  });

  it('huỷ: chỉ dòng đã gửi, kẹp số lượng', () => {
    expect(voidSelection(o, { 'l-1': 5, 'l-3': 0, 'l-4': 1, 'l-2': 1 })).toEqual([{ lineId: 'l-1', quantity: 2 }]);
  });

  it('chuyển: cả dòng newLineId null; một phần sinh id dòng mới; gồm dòng chưa gửi', () => {
    let k = 0;
    expect(moveSelection(o, { 'l-1': 1, 'l-3': 1, 'l-4': 1 }, () => `new-${++k}`)).toEqual([
      { lineId: 'l-3', quantity: 1, newLineId: null },
      { lineId: 'l-1', quantity: 1, newLineId: 'new-1' },
      { lineId: 'l-4', quantity: 1, newLineId: null },
    ]);
  });

  it('tạm tính lỗi thời khi tổng đổi', () => {
    const bill = { firstPrintedAt: '', lastPrintedAt: '', printCount: 1, lastTotal: 100000, lastByName: 'Lan' };
    expect(billOutdated(o)).toBe(false);
    expect(billOutdated({ ...o, bill })).toBe(true);
    expect(billOutdated({ ...o, bill: { ...bill, lastTotal: 120000 } })).toBe(false);
  });

  it('lệnh có kiểm phiên bản chỉ khi đơn không còn lệnh chờ; món đang gửi lấy từ hàng đợi; bỏ lệnh trả lại món', () => {
    const d = itemDraft(menu.dishes[1]!, menu.dishes[1]!.variants[0]!);
    let q: QueueEntry[] = appendEntry([], { kind: 'addLines', orderIds: ['o-1'], method: 'POST', path: '/x', body: { clientRequestId: 'r1' }, preview: { drafts: [d] } }, 0);
    expect(canRunVersioned(o, q)).toBe(false);
    expect(canRunVersioned(o, [])).toBe(true);
    expect(canRunVersioned({ ...o, status: 'Paid' }, [])).toBe(false);
    expect(outboxLines(q, 'o-1')).toEqual([{ draft: d, state: 'queued' }]);
    expect(draftsToRestore(q, 'o-1')).toEqual([]);
    q = settleEntries(q, 'r1', { kind: 'attention', status: 409, problem: readProblem({ errorCodes: ['DiningTable.Occupied'] }) }, 0);
    expect(draftsToRestore(q, 'o-1', () => 'fresh')).toEqual([{ ...d, id: 'fresh' }]);
  });
});

// ── Sơ đồ bàn ───────────────────────────────────────────────────────────

describe('sơ đồ bàn', () => {
  const floor: IFnbFloor = {
    branchId: 'b-1',
    serverTime: '',
    cursor: 'c-1',
    menuVersion: 'm-1',
    tablesVersion: 't-1',
    areas: [
      { id: 'a-2', name: 'Lầu 1', sortOrder: 2, tables: [{ id: 't-9', name: 'Bàn 9', seats: 4, sortOrder: 1, isActive: true, orders: [] }] },
      {
        id: 'a-1',
        name: 'Tầng trệt',
        sortOrder: 1,
        tables: [
          { id: 't-2', name: 'Bàn 2', seats: null, sortOrder: 2, isActive: true, orders: [] },
          { id: 't-1', name: 'Bàn 1', seats: 4, sortOrder: 1, isActive: true, orders: [summaryOf(order({ id: 'o-old', version: 2 }))] },
        ],
      },
    ],
    takeawayOrders: [],
    unprintedTickets: [],
  };

  it('trạng thái bàn suy ra từ đơn đang mở', () => {
    expect(tableStatus({ orders: [] })).toBe('free');
    expect(tableStatus({ orders: [summaryOf(order())] })).toBe('occupied');
    expect(tableStatus({ orders: [summaryOf(order({ bill: { firstPrintedAt: '', lastPrintedAt: '', printCount: 1, lastTotal: 0, lastByName: '' } }))] })).toBe('billed');
  });

  it('bàn theo khu vực và thứ tự', () => {
    expect(tablesOf(floor, null).map((t) => t.id)).toEqual(['t-1', 't-2', 't-9']);
    expect(tablesOf(floor, 'a-2').map((t) => [t.id, t.areaName])).toEqual([['t-9', 'Lầu 1']]);
  });

  it('áp đơn mới: theo version, đơn đóng biến mất, đơn mới vào bàn / mang về', () => {
    const next = applyOrdersToFloor(floor, [
      order({ id: 'o-old', version: 1, status: 'Paid' }), // cũ hơn → bỏ qua
      order({ id: 'o-new', tableId: 't-2', version: 1 }),
      order({ id: 'o-ta', tableId: null, version: 1 }),
      order({ id: 'o-x', branchId: 'b-khac' }),
    ]);
    expect(tablesOf(next, null).map((t) => t.orders.map((o) => o.id))).toEqual([['o-old'], ['o-new'], []]);
    expect(next.takeawayOrders.map((o) => o.id)).toEqual(['o-ta']);
    const closed = applyOrdersToFloor(next, [order({ id: 'o-old', version: 3, status: 'Paid' })]);
    expect(tablesOf(closed, null)[0]!.orders).toEqual([]);
  });

  it('nơi chuyển món: gộp vào đơn khác, mở đơn mới ở bàn, mang về; không gồm đơn nguồn', () => {
    const keys = moveOptions(floor, 'o-old').map((o) => o.key);
    expect(keys).toEqual(['t:t-1', 't:t-2', 't:t-9', 't:takeaway']);
    expect(moveOptions(floor, 'o-other').map((o) => o.key)).toContain('o:o-old');
  });

  it('phiếu chưa in quá 30 giây; số phút đã ngồi; sơ đồ dự phòng từ /fnb/areas', () => {
    const now = Date.parse('2026-10-06T08:16:01.000Z');
    const tk = (id: string, createdAt: string, printStatus = 'Pending') => ({ id, orderId: 'o', kind: 'Order', printStatus, createdAt, claimExpiresAt: null });
    expect(staleUnprinted([tk('a', '2026-10-06T08:15:31.000Z'), tk('b', '2026-10-06T08:15:40.000Z'), tk('c', '2026-10-06T08:00:00.000Z', 'Printed')], now).map((x) => x.id)).toEqual(['a']);
    expect(minutesSince('2026-10-06T08:00:00.000Z', now)).toBe(16);
    const f = floorFromAreas('b-1', [
      { id: 'a', name: 'A', sortOrder: 1, isActive: true, tables: [{ id: 't', name: 'T', seats: null, sortOrder: 1, isActive: false }] },
      { id: 'z', name: 'Z', sortOrder: 2, isActive: false },
    ]);
    expect(f.areas).toEqual([{ id: 'a', name: 'A', sortOrder: 1, tables: [] }]);
  });
});

// ── Lưu đơn / phiếu, kết quả lệnh ───────────────────────────────────────

const ticket = (p: Partial<IKitchenTicket> = {}): IKitchenTicket =>
  ({ id: 'tk-1', kind: 'Order', branchId: 'b-1', orderId: 'o-1', printStatus: 'Pending', createdAt: '2026-10-06T08:15:31.200Z', claimExpiresAt: null, updatedAt: '2026-10-06T08:15:31.200Z', ...p }) as IKitchenTicket;

describe('lưu đơn và kết quả lệnh', () => {
  it('đơn đến version >= thì thay; phiếu đến updatedAt >= thì thay', () => {
    expect(newerOrder(undefined, order())).toBe(true);
    expect(newerOrder(order({ version: 3 }), order({ version: 3 }))).toBe(true);
    expect(newerOrder(order({ version: 3 }), order({ version: 2 }))).toBe(false);
    expect(newerTicket(ticket({ updatedAt: '2026-10-06T08:16:00.000Z' }), ticket())).toBe(false);
  });

  it('phiếu chưa in: thêm khi Pending/Failed, bỏ khi đã in; bỏ qua chi nhánh khác', () => {
    const list = applyTicketsToUnprinted([], [ticket(), ticket({ id: 'tk-2', branchId: 'b-2' })], 'b-1');
    expect(list.map((x) => x.id)).toEqual(['tk-1']);
    expect(applyTicketsToUnprinted(list, [ticket({ printStatus: 'Printed' })], 'b-1')).toEqual([]);
  });

  it('phiếu bar mới → in; báo kết quả in thì không in lại; tạm tính / thanh toán in giấy tương ứng', () => {
    const o = order();
    expect(commandEffects({ kind: 'addLines' }, { order: o, ticket: ticket(), replayed: false }, new Set()).prints).toEqual([{ kind: 'kitchenTicket', ticket: ticket() }]);
    expect(commandEffects({ kind: 'addLines' }, { order: o, ticket: ticket() }, new Set(['tk-1'])).prints).toEqual([]);
    expect(commandEffects({ kind: 'printResult' }, { ticket: ticket() }, new Set()).prints).toEqual([]);
    expect(commandEffects({ kind: 'addLines' }, { order: o, ticket: ticket({ printStatus: 'Printed' }) }, new Set()).prints).toEqual([]);
    expect(commandEffects({ kind: 'bill' }, { order: o, replayed: false }, new Set()).prints).toEqual([{ kind: 'provisionalBill', order: o }]);
    expect(commandEffects({ kind: 'bill' }, { order: o, replayed: true }, new Set()).prints).toEqual([]);
    const paid = order({ status: 'Paid' });
    expect(commandEffects({ kind: 'checkout' }, { order: paid, replayed: false }, new Set()).prints).toEqual([{ kind: 'receipt', order: paid }]);
    const moved = commandEffects({ kind: 'move' }, { order: o, otherOrder: order({ id: 'o-2' }) }, new Set());
    expect(moved.orders.map((x) => x.id)).toEqual(['o-1', 'o-2']);
  });
});

// ── Thanh toán, lỗi, sync, bố cục ───────────────────────────────────────

describe('thanh toán (PaymentPanel → checkout)', () => {
  it('tiền mặt: cashTendered khi khách đưa dư, vừa đủ thì null', () => {
    expect(checkoutPlan(110000, { method: 'Cash', cashGiven: 200000 })).toEqual({
      payments: [{ method: 'Cash', amount: 110000, bankAccountId: null, transactionRef: null }],
      cashTendered: 200000,
    });
    expect(checkoutPlan(110000, { method: 'Cash', cashGiven: 110000 }).cashTendered).toBeNull();
  });

  it('chuyển khoản: id tài khoản + nội dung; tổng 0 → không có dòng thanh toán', () => {
    expect(checkoutPlan(50000, { method: 'Transfer', account: { id: 'ba-1' }, transferRef: ' Bàn 5 42 ' }).payments).toEqual([
      { method: 'Transfer', amount: 50000, bankAccountId: 'ba-1', transactionRef: 'Bàn 5 42' },
    ]);
    expect(checkoutPlan(0, { method: 'Card' })).toEqual({ payments: [], cashTendered: null });
  });
});

describe('đọc lỗi và phản hồi đọc', () => {
  it('mã lỗi: errorCodes[0], không có thì khoá đầu của errors, feature_disabled', () => {
    expect(problemCode({ errorCodes: ['OpenOrder.NotOpen'], errors: { a: [] } })).toBe('OpenOrder.NotOpen');
    expect(problemCode({ errors: { '$.branchId': ['x'] } })).toBe('$.branchId');
    expect(problemCode({ error: 'feature_disabled', featureKey: 'commerce.fnb.pos' })).toBe('feature_disabled');
    expect(problemCode('')).toBeNull();
    expect(readProblem({ errorCodes: ['X'], title: 'T', order: { id: 'o', version: 2 }, openOrderIds: ['a', 1] })).toMatchObject({
      code: 'X',
      title: 'T',
      order: { id: 'o', version: 2 },
      openOrderIds: ['a'],
    });
  });

  it('floor / sync: 404 không mã = máy chủ chưa có endpoint; cursor hết hạn → bắt đầu lại', () => {
    expect(readFloorResponse(404, '').kind).toBe('unsupported');
    expect(readFloorResponse(404, { errorCodes: ['Branch.NotFound'] }).kind).toBe('error');
    expect(readSyncResponse(409, { errorCodes: ['Fnb.CursorExpired'] }).kind).toBe('restart');
    expect(readSyncResponse(404, null).kind).toBe('unsupported');
    const ok = readSyncResponse(200, { cursor: 'c-2', hasMore: false });
    expect(ok).toMatchObject({ kind: 'ok', sync: { cursor: 'c-2', orders: [], tickets: [] } });
  });
});

describe('bố cục', () => {
  it('chia cột theo bề rộng thật, tối thiểu số cột', () => {
    expect(gridColumns(0, 150, 2)).toBe(2);
    expect(gridColumns(480, 150, 2)).toBe(3);
    expect(gridColumns(300, 150, 3)).toBe(3);
    expect(tileWidth(480, 3)).toBe(153);
    expect(orderPaneWidth(1366, true)).toBe(460);
    expect(orderPaneWidth(820, false)).toBe(344);
  });
});
