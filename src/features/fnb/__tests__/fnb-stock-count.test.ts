import type { IFnbStockCountLine } from 'src/types/fnb';

import { hasInvalidEdit, isCounted, progress, shownQuantity, toEntries, visibleLines } from '../stock-count';

// Kiểm kho trên app.

const line = (lineId: string, productName: string, over: Partial<IFnbStockCountLine> = {}): IFnbStockCountLine => ({
  lineId,
  productId: `p-${lineId}`,
  productCode: `NL-${lineId}`,
  productName,
  unit: 'g',
  units: [],
  isCounted: false,
  countedQuantity: null,
  ...over,
});

const count = { lines: [line('1', 'Cà phê xay', { isCounted: true, countedQuantity: 940.5 }), line('2', 'Sữa tươi'), line('3', 'Đường nước')] };

describe('số đếm gửi lên', () => {
  it('số hợp lệ gửi theo đơn vị đã chọn, ô trống là xoá số đếm, chữ sai thì không gửi', () => {
    expect(
      toEntries({
        '1': { quantity: '950', unitId: null },
        '2': { quantity: '2,5', unitId: 'box' },
        '3': { quantity: '', unitId: null },
        '4': { quantity: 'abc', unitId: null },
      })
    ).toEqual([
      { lineId: '1', parts: [{ unitId: null, quantity: 950 }] },
      { lineId: '2', parts: [{ unitId: 'box', quantity: 2.5 }] },
      { lineId: '3', parts: [] },
    ]);
    expect(hasInvalidEdit({ '4': { quantity: 'abc', unitId: null } })).toBe(true);
    expect(hasInvalidEdit({ '4': { quantity: '-1', unitId: null } })).toBe(true);
    expect(hasInvalidEdit({ '1': { quantity: '0', unitId: null }, '3': { quantity: '', unitId: null } })).toBe(false);
  });
});

describe('tiến độ đếm', () => {
  it('đếm 0 vẫn là đã đếm; xoá số trên máy thì thành chưa đếm', () => {
    expect(progress(count, {})).toEqual({ counted: 1, total: 3 });
    expect(progress(count, { '2': { quantity: '0', unitId: null } })).toEqual({ counted: 2, total: 3 });
    expect(isCounted(count.lines[0], { '1': { quantity: '', unitId: null } })).toBe(false);
  });

  it('lọc theo chữ tìm không dấu và chỉ dòng chưa đếm', () => {
    expect(visibleLines(count, {}, 'sua', false).map((l) => l.lineId)).toEqual(['2']);
    expect(visibleLines(count, { '2': { quantity: '5', unitId: null } }, '', true).map((l) => l.lineId)).toEqual(['3']);
  });

  it('ô nhập hiện số đang gõ, không thì số đã lưu (dấu phẩy thập phân)', () => {
    expect(shownQuantity(count.lines[0], {})).toBe('940,5');
    expect(shownQuantity(count.lines[0], { '1': { quantity: '95', unitId: null } })).toBe('95');
    expect(shownQuantity(count.lines[1], {})).toBe('');
  });
});
