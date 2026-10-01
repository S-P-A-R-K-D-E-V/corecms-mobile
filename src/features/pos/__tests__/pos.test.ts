import { useCart, cartCount, cartTotal, lineFromProduct, lineFromVariant } from '../cart-store';
import { cashSuggestions, vietQrUrl } from '../payment-utils';

const product = { id: 'p1', code: 'K35', name: 'Kẹp tóc - K35', basePrice: 35_000, inventories: [{ onHand: 4 }, { onHand: 2 }] } as any;
const parent = { id: 'p2' } as any;
const child = { id: 'c1', code: 'SC18-D', name: 'Scrunchies', fullName: 'Scrunchies - Đen', basePrice: 18_000, isActive: true, inventories: [{ onHand: 3 }] } as any;

describe('giỏ hàng', () => {
  beforeEach(() => useCart.getState().clear());

  it('bấm lại cùng món thì tăng số lượng, biến thể là dòng riêng', () => {
    const { add } = useCart.getState();
    add(lineFromProduct(product));
    add(lineFromProduct(product));
    add(lineFromVariant(parent, child));
    const { lines } = useCart.getState();
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ key: 'p1', qty: 2, price: 35_000, stock: 6 });
    expect(lines[1]).toMatchObject({ key: 'c1', productId: 'p2', variantId: 'c1', name: 'Scrunchies - Đen', price: 18_000 });
    expect(cartCount(lines)).toBe(3);
    expect(cartTotal(lines)).toBe(88_000);
  });

  it('giảm về 0 thì bỏ khỏi giỏ; sửa giá không âm', () => {
    const { add, setQty, setPrice } = useCart.getState();
    add(lineFromProduct(product));
    setPrice('p1', -5);
    expect(useCart.getState().lines[0].price).toBe(0);
    setQty('p1', 0);
    expect(useCart.getState().lines).toHaveLength(0);
  });
});

describe('thanh toán', () => {
  it('gợi ý tiền khách đưa: đủ tiền rồi các mệnh giá làm tròn lên', () => {
    expect(cashSuggestions(285_000)).toEqual([285_000, 290_000, 300_000, 400_000]);
    expect(cashSuggestions(50_000)).toEqual([50_000, 100_000, 200_000, 500_000]);
  });

  it('ảnh VietQR theo BIN + số tài khoản + số tiền + nội dung', () => {
    expect(vietQrUrl({ id: 'b', bin: '970422', accountNumber: '0123456789' }, 285_000, 'TT 482913')).toBe(
      'https://img.vietqr.io/image/970422-0123456789-compact2.png?amount=285000&addInfo=TT%20482913'
    );
    expect(vietQrUrl({ id: 'b', bin: null, accountNumber: '01' }, 1, 'x')).toBeNull();
  });
});
