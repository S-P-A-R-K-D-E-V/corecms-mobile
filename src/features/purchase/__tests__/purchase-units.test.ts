import { baseQuantity, defaultUnit, parseDecimal, parseExpiry, unitOptions, type ProductUnits } from '../purchase-units';

// Nhập hàng theo đơn vị trên app.

const coffee: ProductUnits = {
  productId: 'p1',
  baseUnitId: 'g',
  baseUnitName: 'g',
  managedByKiotViet: false,
  units: [
    { unitId: 'g', name: 'g', factor: 1, source: 'Base', isDefaultPurchase: false },
    { unitId: 'box', name: 'thùng', factor: 5_000, isDefaultPurchase: false },
    { unitId: 'bag', name: 'gói', factor: 500, isDefaultPurchase: true },
  ],
};

describe('đơn vị nhập', () => {
  it('đơn vị gốc đứng đầu (unitId null), đơn vị mua theo hệ số tăng dần', () => {
    expect(unitOptions(coffee)).toEqual([
      { unitId: null, name: 'g', factor: 1 },
      { unitId: 'bag', name: 'gói', factor: 500 },
      { unitId: 'box', name: 'thùng', factor: 5_000 },
    ]);
  });

  it('mặc định là đơn vị nhập mặc định của hàng, không có thì đơn vị gốc', () => {
    expect(defaultUnit(coffee)).toEqual({ unitId: 'bag', name: 'gói', factor: 500 });
    expect(defaultUnit({ ...coffee, units: [] })).toEqual({ unitId: null, name: 'g', factor: 1 });
  });

  it('quy về đơn vị gốc', () => {
    expect(baseQuantity(2.5, { unitId: 'bag', name: 'gói', factor: 500 })).toBe(1_250);
    expect(baseQuantity(3, null)).toBe(3);
  });
});

describe('ô nhập', () => {
  it('số lượng nhận số lẻ với dấu phẩy, từ chối chữ và số âm', () => {
    expect(parseDecimal('2,5')).toBe(2.5);
    expect(parseDecimal('0.12345')).toBe(0.1235);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('-1')).toBeNull();
    expect(parseDecimal('abc')).toBeNull();
  });

  it('hạn dùng: ngày/tháng/năm hoặc năm-tháng-ngày; trống = không ghi hạn; ngày không có thật = sai', () => {
    expect(parseExpiry('31/12/2026')).toBe('2026-12-31');
    expect(parseExpiry('2026-1-5')).toBe('2026-01-05');
    expect(parseExpiry(' ')).toBeNull();
    expect(parseExpiry('31/02/2026')).toBeUndefined();
    expect(parseExpiry('12/2026')).toBeUndefined();
  });
});
