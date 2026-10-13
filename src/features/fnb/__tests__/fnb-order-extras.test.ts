jest.mock('expo-crypto', () => ({ randomUUID: () => 'ID-1' }));
jest.mock('src/api/axios', () => ({
  __esModule: true,
  default: {},
  endpoints: { fnb: { orderInfo: (id: string) => `/fnb/orders/${id}/info`, orderDiscount: (id: string) => `/fnb/orders/${id}/discount`, orderLinePrice: (id: string, l: string) => `/fnb/orders/${id}/lines/${l}/price` } },
}));
jest.mock('src/api/fnb', () => ({ getFnbOrder: jest.fn() }));

import type { IOpenOrder, IOrderLine } from 'src/types/fnb';

import { discountCmd, infoCmd, priceCmd } from '../fnb-commands';
import { customerLabel, discountAmount, discountInput, parseDong, priceableLines, priceInput } from '../order-extras';

// Giảm giá đơn và sửa giá món trên app (quản lý).

const ctx = { deviceId: 'dev-1', now: new Date('2026-10-13T03:00:00Z') };
const order = { id: 'o1', version: 5 };

describe('ô nhập tiền', () => {
  it('nhận dấu phân cách nghìn, từ chối chữ và số âm', () => {
    expect(parseDong('25.000')).toBe(25_000);
    expect(parseDong(' 1,500,000 ')).toBe(1_500_000);
    expect(parseDong('')).toBeNull();
    expect(parseDong('-5')).toBeNull();
    expect(parseDong('12a')).toBeNull();
  });
});

describe('giảm giá toàn đơn', () => {
  it('xem trước theo công thức của máy chủ', () => {
    expect(discountAmount('Percent', 10, 64_000)).toBe(6_400);
    expect(discountAmount('Percent', 15, 33_333)).toBe(5_000); // 4 999,95 làm tròn nửa lên
    expect(discountAmount('Amount', 100_000, 64_000)).toBe(64_000);
    expect(discountAmount('Amount', 0, 64_000)).toBe(0);
  });

  it('phần trăm 1–100, số tiền không quá tạm tính, bắt buộc lý do', () => {
    expect(discountInput('Percent', '10', ' Khách quen ', 64_000)).toEqual({ type: 'Percent', value: 10, reason: 'Khách quen' });
    expect(discountInput('Percent', '101', 'x', 64_000)).toBeNull();
    expect(discountInput('Amount', '70.000', 'x', 64_000)).toBeNull();
    expect(discountInput('Amount', '5.000', '', 64_000)).toBeNull();
  });

  it('lệnh đặt và bỏ giảm giá mang phiên bản của đơn', () => {
    const set = discountCmd(ctx, order, { type: 'Percent', value: 10, reason: 'Khách quen' });
    expect([set.kind, set.method, set.path]).toEqual(['discount', 'PUT', '/fnb/orders/o1/discount']);
    expect(set.body).toMatchObject({ baseVersion: 5, type: 'Percent', value: 10, reason: 'Khách quen' });

    const clear = discountCmd(ctx, order, null);
    expect(clear.body).toMatchObject({ baseVersion: 5, type: null, value: null, reason: null });
  });
});

describe('sửa giá một dòng', () => {
  const line = (over: Partial<IOrderLine>): IOrderLine =>
    ({ id: 'l1', seq: 1, status: 'Sent', quantity: 1, unitPrice: 35_000, listPrice: 35_000, ...over }) as IOrderLine;

  it('chỉ dòng còn tính tiền, theo thứ tự trên đơn', () => {
    const o = {
      lines: [line({ id: 'b', seq: 2 }), line({ id: 'x', seq: 3, status: 'Voided', quantity: 0 }), line({ id: 'a', seq: 1, status: 'Pending' })],
    } as IOpenOrder;
    expect(priceableLines(o).map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('giá mới phải khác giá đang áp và có lý do; cho phép giá 0', () => {
    expect(priceInput(line({}), '30.000', 'Ly bị đổ một ít')).toEqual({ unitPrice: 30_000, reason: 'Ly bị đổ một ít' });
    expect(priceInput(line({}), '0', 'Tặng')).toEqual({ unitPrice: 0, reason: 'Tặng' });
    expect(priceInput(line({}), '35000', 'x')).toBeNull();
    expect(priceInput(line({}), '30000', ' ')).toBeNull();
  });

  it('lệnh sửa giá và trả về giá niêm yết', () => {
    const set = priceCmd(ctx, order, 'l1', { unitPrice: 30_000, reason: 'Ly bị đổ' });
    expect([set.kind, set.method, set.path]).toEqual(['price', 'PUT', '/fnb/orders/o1/lines/l1/price']);
    expect(set.body).toMatchObject({ baseVersion: 5, unitPrice: 30_000, reason: 'Ly bị đổ' });
    expect(priceCmd(ctx, order, 'l1', null).body).toMatchObject({ unitPrice: null, reason: null });
  });
});

describe('gắn khách hàng vào đơn', () => {
  it('đổi khách hàng vẫn gửi lại số khách và ghi chú đang có của đơn', () => {
    const cmd = infoCmd(ctx, { id: 'o1', guestCount: 3, note: 'Sinh nhật' }, { customerId: 'c1' });
    expect([cmd.kind, cmd.method, cmd.path]).toEqual(['info', 'PUT', '/fnb/orders/o1/info']);
    expect(cmd.body).toMatchObject({ guestCount: 3, customerId: 'c1', note: 'Sinh nhật' });
    expect(infoCmd(ctx, { id: 'o1', guestCount: null, note: null }, { customerId: null }).body).toMatchObject({ customerId: null });
  });

  it('hiện tên kèm số điện thoại khi có', () => {
    expect(customerLabel({ name: 'Chị Lan', contactNumber: '0901234567' })).toBe('Chị Lan · 0901234567');
    expect(customerLabel({ name: 'Anh Minh', contactNumber: null })).toBe('Anh Minh');
  });
});
