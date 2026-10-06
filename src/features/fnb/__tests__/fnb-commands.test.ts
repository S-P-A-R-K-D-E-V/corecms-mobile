let mockN = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `ID-${String(++mockN).padStart(4, '0')}` }));
jest.mock('src/api/axios', () => ({
  __esModule: true,
  default: {},
  endpoints: {
    fnb: {
      order: (id: string) => `/fnb/orders/${id}`,
      orderLines: (id: string) => `/fnb/orders/${id}/lines`,
      orderLine: (id: string, l: string) => `/fnb/orders/${id}/lines/${l}`,
      orderSend: (id: string) => `/fnb/orders/${id}/send`,
      orderVoid: (id: string) => `/fnb/orders/${id}/void`,
      orderMove: (id: string) => `/fnb/orders/${id}/move`,
      orderBill: (id: string) => `/fnb/orders/${id}/bill`,
      orderCheckout: (id: string) => `/fnb/orders/${id}/checkout`,
      orderCancel: (id: string) => `/fnb/orders/${id}/cancel`,
      ticketPrintResult: (id: string) => `/fnb/kitchen-tickets/${id}/print-result`,
    },
  },
}));

import {
  addLinesCmd,
  billCmd,
  cancelCmd,
  checkoutCmd,
  moveCmd,
  openOrderCmd,
  printResultCmd,
  removePendingLineCmd,
  sendCmd,
  voidCmd,
} from '../fnb-commands';
import { isoNow, newId } from '../fnb-ids';
import { line } from '../__fixtures__/orders';

const ctx = { deviceId: 'dev-1', now: new Date('2026-10-06T08:15:30Z') };

beforeEach(() => {
  mockN = 0;
});

describe('mã sinh trên máy', () => {
  it('uuid chữ thường từ expo-crypto; thời điểm ISO UTC có Z và 3 chữ số thập phân', () => {
    expect(newId()).toBe('id-0001');
    expect(isoNow(new Date('2026-10-06T08:15:30Z'))).toBe('2026-10-06T08:15:30.000Z');
  });
});

describe('lệnh ghi (contract 5.x)', () => {
  it('mở đơn: PUT /fnb/orders/{id}, envelope đủ, takeaway khi tableId null', () => {
    const cmd = openOrderCmd(ctx, { orderId: 'o-1', branchId: 'b-1', tableId: null });
    expect(cmd).toMatchObject({ kind: 'open', method: 'PUT', path: '/fnb/orders/o-1', orderIds: ['o-1'] });
    expect(cmd.body).toEqual({
      clientRequestId: 'id-0001',
      deviceId: 'dev-1',
      clientTime: '2026-10-06T08:15:30.000Z',
      branchId: 'b-1',
      tableId: null,
      guestCount: null,
      customerId: null,
      note: null,
      clientOrderNo: null,
      allowSharedTable: false,
    });
  });

  it('thêm món kèm gửi bar: send.ticketId; không gửi bar: send null', () => {
    const lines = [{ id: 'l-1', lineType: 'Item' as const, productId: 'p', quantity: 2, toppings: [], quickNotes: [], note: null }];
    expect(addLinesCmd(ctx, 'o-1', lines, 'tk-9').body).toMatchObject({ lines, send: { ticketId: 'tk-9' } });
    expect(addLinesCmd(ctx, 'o-1', lines, null).body.send).toBeNull();
  });

  it('mỗi lệnh một clientRequestId mới', () => {
    const a = sendCmd(ctx, 'o-1', 'tk-1');
    const b = sendCmd(ctx, 'o-1', 'tk-2');
    expect(a.body.clientRequestId).not.toBe(b.body.clientRequestId);
    expect(a.body).toMatchObject({ ticketId: 'tk-1', lineIds: null });
  });

  it('bỏ dòng chưa gửi: quantity 0, giữ các trường còn lại', () => {
    const item = removePendingLineCmd(ctx, 'o-1', line({ id: 'l-1', status: 'Pending', toppings: [{ productId: 'tp', name: 'TC', quantity: 2, unitPrice: 5000 }], quickNotes: ['Ít đá'] }));
    expect(item).toMatchObject({ method: 'PUT', path: '/fnb/orders/o-1/lines/l-1' });
    expect(item.body).toMatchObject({ productId: 'p-1', quantity: 0, toppings: [{ productId: 'tp', quantity: 2 }], quickNotes: ['Ít đá'], note: null });
    const open = removePendingLineCmd(ctx, 'o-1', line({ id: 'l-2', lineType: 'OpenItem', name: 'Bánh mì', unitPrice: 30000 }));
    expect(open.body).toMatchObject({ name: 'Bánh mì', unitPrice: 30000, quantity: 0 });
    expect(open.body).not.toHaveProperty('productId');
  });

  it('huỷ món: baseVersion, lý do đã cắt khoảng trắng, phiếu HỦY mới', () => {
    const cmd = voidCmd(ctx, { id: 'o-1', version: 3 }, { reason: '  Khách đổi món ', alreadyMade: true, lines: [{ lineId: 'l-1', quantity: 1 }] });
    expect(cmd.body).toMatchObject({ baseVersion: 3, reason: 'Khách đổi món', alreadyMade: true, ticketId: 'id-0002', lines: [{ lineId: 'l-1', quantity: 1 }] });
  });

  it('chuyển món: hàng của cả đơn nguồn lẫn đơn đích; create chỉ khi mở đơn mới', () => {
    const lines = [{ lineId: 'l-1', quantity: 1, newLineId: 'nl-1' }];
    const create = moveCmd(ctx, { id: 'o-1', version: 4 }, { kind: 'create', orderId: 'o-2', tableId: 't-8' }, lines);
    expect(create.orderIds).toEqual(['o-1', 'o-2']);
    expect(create.body).toMatchObject({ baseVersion: 4, target: { orderId: 'o-2', create: { tableId: 't-8', guestCount: null, clientOrderNo: null } }, lines });
    const merge = moveCmd(ctx, { id: 'o-1', version: 4 }, { kind: 'existing', orderId: 'o-3' }, lines);
    expect((merge.body.target as any).create).toBeNull();
  });

  it('tạm tính / thanh toán / huỷ đơn mang baseVersion', () => {
    expect(billCmd(ctx, { id: 'o-1', version: 5 }).body).toMatchObject({ baseVersion: 5 });
    const pay = checkoutCmd(ctx, { id: 'o-1', version: 5 }, { expectedTotal: 110000, payments: [], cashTendered: null, sendPending: false });
    expect(pay.body).toMatchObject({ baseVersion: 5, expectedTotal: 110000, sendTicketId: null });
    expect(checkoutCmd(ctx, { id: 'o-1', version: 5 }, { expectedTotal: 0, payments: [], cashTendered: null, sendPending: true }).body.sendTicketId).toMatch(/^id-/);
    expect(cancelCmd(ctx, { id: 'o-1', version: 5 }, { hasSentLines: false, reason: '  ', alreadyMade: false }).body).toMatchObject({ reason: null, ticketId: null });
    expect(cancelCmd(ctx, { id: 'o-1', version: 5 }, { hasSentLines: true, reason: 'Khách bỏ về', alreadyMade: true }).body.ticketId).toMatch(/^id-/);
  });

  it('báo kết quả in: xếp chung hàng với đơn của phiếu', () => {
    const cmd = printResultCmd({ ...ctx, deviceName: 'iPad quầy' }, { id: 'tk-1', orderId: 'o-1' }, { result: 'Skipped' });
    expect(cmd).toMatchObject({ kind: 'printResult', orderIds: ['o-1'], path: '/fnb/kitchen-tickets/tk-1/print-result' });
    expect(cmd.body).toMatchObject({ deviceName: 'iPad quầy', result: 'Skipped', error: null, reprint: false });
  });
});
