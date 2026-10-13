import type { IFnbLot, IFnbStockIngredient } from 'src/types/fnb';

import { expiryCounts, lotState, lotTone, sortedIngredients, sortedLots, stockTone } from '../stock-view';

// Xem tồn và hạn dùng trên app.

const ingredient = (name: string, status: string): IFnbStockIngredient => ({ id: name, code: name, name, unit: 'g', onHand: 1, status });

const lot = (productName: string, expiryDate: string | null, daysLeft: number | null, remaining = 100): IFnbLot => ({
  id: `${productName}-${expiryDate}`,
  productName,
  unit: 'ml',
  label: null,
  expiryDate,
  daysLeft,
  remaining,
});

describe('tồn nguyên liệu', () => {
  it('hết và sắp hết lên đầu, rồi theo tên; tìm không dấu', () => {
    const list = [ingredient('Sữa tươi', 'ok'), ingredient('Đường', 'low'), ingredient('Cà phê', 'out'), ingredient('Bột', 'low')];
    expect(sortedIngredients(list).map((i) => i.name)).toEqual(['Cà phê', 'Bột', 'Đường', 'Sữa tươi']);
    expect(sortedIngredients(list, 'sua').map((i) => i.name)).toEqual(['Sữa tươi']);
    expect([stockTone('out'), stockTone('low'), stockTone('ok')]).toEqual(['error', 'warning', 'muted']);
  });
});

describe('hạn dùng theo lô', () => {
  const lots = [lot('Trà', null, null), lot('Sữa', '2026-10-15', 2), lot('Kem', '2026-10-12', -1), lot('Cà phê', '2027-01-01', 80), lot('Hết', '2026-10-10', -3, 0)];

  it('quá hạn, sắp hết hạn (trong số ngày cảnh báo), còn hạn, không ghi hạn', () => {
    expect(lots.slice(0, 4).map((l) => lotState(l, 3))).toEqual(['none', 'expiring', 'expired', 'ok']);
    expect([lotTone('expired'), lotTone('expiring'), lotTone('ok')]).toEqual(['error', 'warning', 'muted']);
  });

  it('hạn sớm nhất trước, lô không ghi hạn xuống cuối, bỏ lô đã hết hàng', () => {
    expect(sortedLots(lots).map((l) => l.productName)).toEqual(['Kem', 'Sữa', 'Cà phê', 'Trà']);
  });

  it('đếm lô quá hạn và sắp hết hạn còn hàng', () => {
    expect(expiryCounts(lots, 3)).toEqual({ expired: 1, expiring: 1 });
  });
});
