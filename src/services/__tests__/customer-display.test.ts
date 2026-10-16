// Màn hình khách (màn phụ máy quầy): ưu tiên đã thanh toán > QR > giỏ > quảng cáo; chữ / số tiền định dạng sẵn.

const mockRender = jest.fn();
jest.mock('../../../modules/customer-display', () => ({
  CustomerDisplayModule: {
    isAvailable: () => true,
    render: (s: string) => mockRender(s),
    hide: jest.fn(),
    setKeepAwake: jest.fn(),
    addListener: () => ({ remove: jest.fn() }),
  },
}));
jest.mock('src/i18n/format', () => ({ formatMoney: (v: number) => `${v}đ` }));

import { buildPayload, customerDisplay } from '../customer-display';

const cart = {
  lines: [
    { key: 'a', name: 'Áo thun', qty: 2, price: 100, amount: 200 },
    { key: 'b', name: 'Mũ', qty: 1, price: 50, amount: 50 },
  ],
  total: 250,
};

describe('customer display payload', () => {
  const empty = { cart: null, qr: null, paid: null, ads: null, storeName: 'Cửa hàng A' };

  it('idle shows the ads', () => {
    const p = buildPayload({ ...empty, ads: { intervalSeconds: 8, slides: [{ url: 'u', kind: 'image' }] } });
    expect(p).toMatchObject({ mode: 'idle', storeName: 'Cửa hàng A', ads: { interval: 8 } });
  });

  it('cart lines and totals are pre-formatted', () => {
    const p = buildPayload({ ...empty, cart }) as any;
    expect(p.mode).toBe('cart');
    expect(p.cart.lines[0]).toEqual({ name: 'Áo thun', detail: null, qty: '2 × 100đ', amount: '200đ' });
    expect(p.cart.totals.at(-1)).toEqual({ label: 'Tổng thanh toán', value: '250đ', strong: true });
    expect(p.cart.totals[0].label).toBe('Tạm tính (3 món)');
  });

  it('qr beats cart and paid beats qr', () => {
    const qr = { imageUrl: 'https://img.vietqr.io/x.png', amount: 250, bankLine: 'MB · 0123', note: 'SP1' };
    const withQr = buildPayload({ ...empty, cart, qr }) as any;
    expect(withQr.mode).toBe('qr');
    expect(withQr.qr.lines).toEqual(['MB · 0123', 'Nội dung: SP1']);
    const paid = buildPayload({ ...empty, cart, qr, paid: { amount: 250, until: Date.now() + 1000 } }) as any;
    expect(paid.mode).toBe('paid');
    expect(paid.paid.amount).toBe('Đã thanh toán 250đ');
  });

  it('sends to the native module (throttled)', () => {
    jest.useFakeTimers();
    customerDisplay.setCart(cart);
    customerDisplay.setCart({ ...cart, total: 260 });
    jest.advanceTimersByTime(200);
    expect(mockRender).toHaveBeenCalledTimes(1);
    expect(JSON.parse(mockRender.mock.calls[0][0]).mode).toBe('cart');
    jest.useRealTimers();
  });
});
