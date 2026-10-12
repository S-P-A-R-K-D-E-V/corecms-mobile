import type { IFnbStockIngredient } from 'src/types/fnb';

import { baseQuantity, disposalError, newDisposalLine, searchIngredients, toDisposalLines } from '../disposal';

// Xuất huỷ trên app — cùng luật với web.

const milk: IFnbStockIngredient = {
  id: 'milk',
  code: 'NL05',
  name: 'Sữa tươi',
  unit: 'ml',
  onHand: 6_000,
  units: [{ unitId: 'box', name: 'hộp', factor: 1_000 }],
};
const bean: IFnbStockIngredient = { id: 'bean', code: 'NL01', name: 'Cà phê xay', unit: 'g', onHand: 2_000, units: [] };

describe('chọn nguyên liệu', () => {
  it('tìm không dấu theo tên hoặc mã, bỏ nguyên liệu đã có trong phiếu', () => {
    expect(searchIngredients([milk, bean], 'sua', new Set()).map((i) => i.id)).toEqual(['milk']);
    expect(searchIngredients([milk, bean], 'nl01', new Set()).map((i) => i.id)).toEqual(['bean']);
    expect(searchIngredients([milk, bean], '', new Set(['milk'])).map((i) => i.id)).toEqual(['bean']);
  });
});

describe('dòng xuất huỷ', () => {
  it('quy về đơn vị gốc theo đơn vị đã chọn, nhận dấu phẩy thập phân', () => {
    const line = { ...newDisposalLine(milk), quantity: '1,5', unitId: 'box' };
    expect(baseQuantity(line)).toBe(1_500);
    expect(baseQuantity({ ...line, unitId: null })).toBe(1.5);
    expect(baseQuantity({ ...line, quantity: '0' })).toBeNull();
    expect(baseQuantity({ ...line, unitId: 'la' })).toBeNull();
  });

  it('phiếu cần ít nhất một dòng và mọi dòng có số lượng hợp lệ', () => {
    expect(disposalError([])).toBe('fnbStock.disposalNeedLine');
    expect(disposalError([newDisposalLine(milk)])).toBe('fnbStock.disposalBadQty');
    expect(disposalError([{ ...newDisposalLine(milk), quantity: '200' }])).toBeNull();
  });

  it('gửi số lượng theo đơn vị đã chọn kèm lý do', () => {
    const lines = [{ ...newDisposalLine(milk), quantity: '2', unitId: 'box', reason: 'Spilled' as const }];
    expect(toDisposalLines(lines)).toEqual([{ productId: 'milk', quantity: 2, unitId: 'box', reason: 'Spilled' }]);
  });
});
