import { onlineOrderWebUrl } from '../push-links';

// Push "đơn online đã thanh toán" → trang Đơn online trên web của cửa hàng đang gắn.

const paid = { category: 'Order', type: 'online_order_paid', orderId: '3f1c2b8e-0000-0000-0000-000000000001', code: 'W7K3MNP2Q', storeCode: 'tiemtoc' };

describe('onlineOrderWebUrl', () => {
  it('mở trang Đơn online của cửa hàng đang gắn, lọc đúng mã đơn', () => {
    expect(onlineOrderWebUrl(paid, 'https://tiemtoc.store.devbyspark.com')).toBe(
      'https://tiemtoc.store.devbyspark.com/dashboard/payment/online-orders?code=W7K3MNP2Q'
    );
    // Gốc web có dấu / cuối; data Android dạng chuỗi JSON.
    expect(onlineOrderWebUrl(JSON.stringify(paid), 'https://cici21chualang.vn/')).toBe(
      'https://cici21chualang.vn/dashboard/payment/online-orders?code=W7K3MNP2Q'
    );
  });

  it('thiếu mã hoặc mã lạ → vẫn mở danh sách, không ghép chuỗi lạ vào URL', () => {
    expect(onlineOrderWebUrl({ ...paid, code: undefined }, 'https://shop.vn')).toBe('https://shop.vn/dashboard/payment/online-orders');
    expect(onlineOrderWebUrl({ ...paid, code: 'W1&next=https://evil.example' }, 'https://shop.vn')).toBe(
      'https://shop.vn/dashboard/payment/online-orders'
    );
  });

  it('push khác (ca làm, tin nhắn, đơn khác) → không mở gì', () => {
    expect(onlineOrderWebUrl({ category: 'Shift', type: 'shift_reminder' }, 'https://shop.vn')).toBeNull();
    expect(onlineOrderWebUrl({ category: 'Order' }, 'https://shop.vn')).toBeNull();
    expect(onlineOrderWebUrl(null, 'https://shop.vn')).toBeNull();
  });

  it('gốc web không phải http(s) hoặc trống → không mở', () => {
    expect(onlineOrderWebUrl(paid, '')).toBeNull();
    expect(onlineOrderWebUrl(paid, null)).toBeNull();
    expect(onlineOrderWebUrl(paid, 'javascript:alert(1)')).toBeNull();
    expect(onlineOrderWebUrl(paid, 'https://shop.vn/path')).toBeNull();
  });
});
