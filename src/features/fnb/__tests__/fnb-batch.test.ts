import type { IFnbBatchRecipeItem } from 'src/types/fnb';

import { addDays, batchRequest, brewable, fDay, parseQuantity, plannedYield, scaleLines, shortages } from '../batch';

// Pha mẻ trên app — cùng luật với web.

const coldBrew: IFnbBatchRecipeItem = {
  productId: 'cb',
  code: 'BTP-COLDBREW',
  name: 'Cold brew',
  unit: 'ml',
  onHand: 0,
  yieldQuantity: 1_800,
  shelfLifeDays: 3,
  note: null,
  lines: [
    { ingredientId: 'bean', quantity: 250 },
    { ingredientId: 'water', quantity: 2_000 },
  ],
};

describe('pha mẻ', () => {
  it('nguyên liệu và sản lượng nhân theo số mẻ', () => {
    expect(scaleLines(coldBrew.lines, 2)).toEqual([
      { ingredientId: 'bean', quantity: 500 },
      { ingredientId: 'water', quantity: 4_000 },
    ]);
    expect(plannedYield(coldBrew, 2)).toBe(3_600);
    expect(plannedYield({ yieldQuantity: null }, 2)).toBeNull();
  });

  it('chỉ bán thành phẩm đã có công thức mẻ mới pha được', () => {
    const noRecipe = { ...coldBrew, productId: 'x', yieldQuantity: null, lines: [] };
    expect(brewable([coldBrew, noRecipe]).map((i) => i.productId)).toEqual(['cb']);
  });

  it('báo nguyên liệu thiếu so với tồn', () => {
    const onHand = new Map([['bean', 400], ['water', 10_000]]);
    expect(shortages(scaleLines(coldBrew.lines, 2), onHand)).toEqual([{ ingredientId: 'bean', missing: 100 }]);
    expect(shortages(scaleLines(coldBrew.lines, 1), onHand)).toEqual([]);
  });

  it('hạn dùng = hôm nay + số ngày bảo quản, qua cả cuối tháng', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(fDay('2026-11-02')).toBe('02/11/2026');
  });

  it('số nhập tay nhận dấu phẩy, bỏ chữ không phải số', () => {
    expect(parseQuantity('1750,5')).toBe(1750.5);
    expect(parseQuantity(' 1800 ')).toBe(1800);
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
});

describe('dữ liệu gửi lập phiếu pha', () => {
  const today = '2026-10-12';

  it('để trống hoặc đúng sản lượng công thức thì không gửi sản lượng; có hạn theo số ngày bảo quản', () => {
    expect(batchRequest(coldBrew, { count: 1, actualYield: '', shelfDays: 3, today })).toEqual({
      productId: 'cb',
      batchCount: 1,
      actualYield: null,
      expiryDate: '2026-10-15',
    });
    expect(batchRequest(coldBrew, { count: 2, actualYield: '3600', shelfDays: 0, today })).toMatchObject({
      actualYield: null,
      expiryDate: '2026-10-12',
    });
  });

  it('sản lượng thật khác công thức thì gửi số thật; không có số ngày bảo quản thì không ghi hạn', () => {
    expect(batchRequest(coldBrew, { count: 1, actualYield: '1750', shelfDays: null, today })).toEqual({
      productId: 'cb',
      batchCount: 1,
      actualYield: 1_750,
      expiryDate: null,
    });
  });

  it('số mẻ hoặc sản lượng không hợp lệ thì chưa gửi được', () => {
    expect(batchRequest(coldBrew, { count: 0, actualYield: '', shelfDays: 3, today })).toBeNull();
    expect(batchRequest(coldBrew, { count: 51, actualYield: '', shelfDays: 3, today })).toBeNull();
    expect(batchRequest(coldBrew, { count: 1, actualYield: '0', shelfDays: 3, today })).toBeNull();
    expect(batchRequest(coldBrew, { count: 1, actualYield: 'x', shelfDays: 3, today })).toBeNull();
  });
});

describe('huỷ phiếu pha', () => {
  const { canCancelBatch } = require('../batch');
  const now = Date.parse('2026-10-13T04:00:00Z');
  const mine = { status: 'Completed', createdById: 'u1', createdAt: '2026-10-13T03:30:00Z' };

  it('quản lý huỷ mọi phiếu còn hiệu lực; nhân viên chỉ phiếu của mình trong 60 phút', () => {
    expect(canCancelBatch(mine, 'u2', true, now)).toBe(true);
    expect(canCancelBatch(mine, 'u1', false, now)).toBe(true);
    expect(canCancelBatch(mine, 'u2', false, now)).toBe(false);
    expect(canCancelBatch({ ...mine, createdAt: '2026-10-13T02:30:00Z' }, 'u1', false, now)).toBe(false);
    expect(canCancelBatch({ ...mine, status: 'Cancelled' }, 'u1', true, now)).toBe(false);
  });
});
