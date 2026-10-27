import { hrPushRoute, inspectionPushRoute, onlineOrderWebUrl } from '../push-links';

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

// Push kiểm tra cửa hàng (core-be StoreInspection) → màn trong app.
describe('inspectionPushRoute', () => {
  it('lỗi mới / quá hạn → lỗi của tôi; nhắc kiểm nhanh / báo cáo tuần → màn Kiểm tra cửa hàng', () => {
    expect(inspectionPushRoute({ category: 'Inspection', type: 'inspection-fault', inspectionId: 'x' })).toBe('/inspection/faults');
    expect(inspectionPushRoute(JSON.stringify({ type: 'inspection-overdue', count: 2 }))).toBe('/inspection/faults');
    expect(inspectionPushRoute({ type: 'inspection-reminder', date: '2026-11-02' })).toBe('/inspection');
    expect(inspectionPushRoute({ type: 'inspection-weekly' })).toBe('/inspection');
    // Loại kiểm tra mới BE thêm sau → vẫn mở màn Kiểm tra cửa hàng.
    expect(inspectionPushRoute({ type: 'inspection-something-new' })).toBe('/inspection');
  });

  it('push khác → không điều hướng', () => {
    expect(inspectionPushRoute(paid)).toBeNull();
    expect(inspectionPushRoute({ category: 'Shift' })).toBeNull();
    expect(inspectionPushRoute(null)).toBeNull();
  });
});

// Push nhân sự (category "Hr") → màn Nhân sự; loại khác không đổi hướng.
describe('hrPushRoute', () => {
  it('push Hr → /hr, cả dạng chuỗi JSON của Android', () => {
    expect(hrPushRoute({ category: 'Hr', storeCode: 'cici' })).toBe('/hr');
    expect(hrPushRoute(JSON.stringify({ category: 'Hr' }))).toBe('/hr');
  });

  it('loại khác → null', () => {
    expect(hrPushRoute({ category: 'Shift' })).toBeNull();
    expect(hrPushRoute(null)).toBeNull();
  });
});
