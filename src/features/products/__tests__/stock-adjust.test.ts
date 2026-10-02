import { QueryClient } from '@tanstack/react-query';

import axios from 'src/api/axios';
import { createStockAdjustment, getStockAdjustments, retryStockAdjustment } from 'src/api/erp';
import { useLocaleStore } from 'src/i18n';
import type { IStockAdjustment } from 'src/types/erp';

import { stockAdjustmentsKey, stockAdjustmentsQuery } from '../hooks';
import {
  POLL_INTERVAL_MS,
  POLL_WINDOW_MS,
  PUSH_DISABLED,
  createRequestIdKeeper,
  isApplied,
  isInFlight,
  newlyApplied,
  parseQuantity,
  previewOnHand,
  reasonLabel,
  shouldPoll,
  signedQuantity,
  sortRecent,
  stockAdjustErrorMessage,
  validateAdjustment,
} from '../stock-adjust';

// Sửa tồn (chủ cửa hàng): Set = số đếm được, Delta = ±lượng; lý do + ghi chú; clientRequestId chống tạo 2 lần.
// Cửa hàng nối KiotViet: 202 Pending → đẩy KiotViet → Synced/Failed; chưa bật đẩy tồn → 409 StockAdjustment.PushDisabled.

const NOW = Date.parse('2026-10-02T05:00:00Z');

const adj = (over: Partial<IStockAdjustment> = {}): IStockAdjustment => ({
  id: 'a1',
  branchId: 1001,
  branchName: 'Chi nhánh 1',
  mode: 'Set',
  quantity: 10,
  reason: 'Count',
  status: 'Pending',
  createdAt: new Date(NOW - 60_000).toISOString(),
  ...over,
});

beforeEach(async () => {
  jest.restoreAllMocks();
  await useLocaleStore.getState().setPreference('vi');
});

describe('parseQuantity', () => {
  it('đọc số nguyên / thập phân (dấu phẩy hoặc chấm), tối đa 3 chữ số thập phân', () => {
    expect(parseQuantity('12')).toBe(12);
    expect(parseQuantity(' 0 ')).toBe(0);
    expect(parseQuantity('12,5')).toBe(12.5);
    expect(parseQuantity('1.125')).toBe(1.125);
    expect(parseQuantity('1.1255')).toBeNull();
  });

  it('không nhận dấu, chữ, rỗng (cộng/trừ chọn bằng nút)', () => {
    for (const s of ['', ' ', '-3', '+3', 'abc', '1.', '.5', '1,2,3']) expect(parseQuantity(s)).toBeNull();
  });
});

describe('signedQuantity + previewOnHand', () => {
  it('Set bỏ qua dấu; Delta cộng/trừ trên tồn hiện tại', () => {
    expect(signedQuantity('Set', 7, -1)).toBe(7);
    expect(signedQuantity('Delta', 7, -1)).toBe(-7);
    expect(previewOnHand(12, 'Set', 7)).toBe(7);
    expect(previewOnHand(12, 'Delta', -7)).toBe(5);
    expect(previewOnHand(0.1, 'Delta', 0.2)).toBe(0.3);
  });
});

describe('validateAdjustment', () => {
  it('Set: số ≥ 0 (kể cả bằng tồn hiện tại — kiểm kê xác nhận lại)', () => {
    expect(validateAdjustment(5, 'Set', 0)).toBeNull();
    expect(validateAdjustment(5, 'Set', 5)).toBeNull();
    expect(validateAdjustment(5, 'Set', null)).toBe('invalid');
    expect(validateAdjustment(5, 'Set', -1)).toBe('invalid');
  });

  it('Delta: khác 0 và không làm tồn âm', () => {
    expect(validateAdjustment(3, 'Delta', 0)).toBe('zeroDelta');
    expect(validateAdjustment(3, 'Delta', -4)).toBe('negative');
    expect(validateAdjustment(3, 'Delta', -3)).toBeNull();
    expect(validateAdjustment(3, 'Delta', 2)).toBeNull();
  });
});

describe('createRequestIdKeeper', () => {
  it('gửi lại đúng nội dung (lỗi mạng) → cùng id; đổi nội dung / đã gửi xong → id mới', () => {
    let n = 0;
    const keeper = createRequestIdKeeper(() => `id-${++n}`);
    const payload = { branchId: 1, mode: 'Set' as const, quantity: 4, reason: 'Count' as const };
    expect(keeper.idFor(payload)).toBe('id-1');
    expect(keeper.idFor({ ...payload })).toBe('id-1');
    expect(keeper.idFor({ ...payload, quantity: 5 })).toBe('id-2');
    expect(keeper.idFor({ ...payload, quantity: 5, note: 'vỡ 1' })).toBe('id-3');
    keeper.reset();
    expect(keeper.idFor({ ...payload, quantity: 5, note: 'vỡ 1' })).toBe('id-4');
  });
});

describe('stockAdjustErrorMessage', () => {
  const disabled = {
    status: 409,
    title: 'Chưa bật đồng bộ tồn kho sang KiotViet, đang chờ thử nghiệm.',
    errorCodes: [PUSH_DISABLED],
  };

  it('409 chưa bật đẩy tồn → câu riêng theo ngôn ngữ app', async () => {
    expect(stockAdjustErrorMessage(disabled)).toMatch(/^Chưa bật đồng bộ tồn kho sang KiotViet/);
    await useLocaleStore.getState().setPreference('en');
    expect(stockAdjustErrorMessage(disabled)).toMatch(/^Stock sync to KiotViet isn’t switched on yet/);
  });

  it('lỗi khác giữ câu của API', () => {
    expect(stockAdjustErrorMessage({ title: 'Đang có một lần chỉnh tồn chờ đẩy cho chi nhánh này.' })).toBe(
      'Đang có một lần chỉnh tồn chờ đẩy cho chi nhánh này.'
    );
  });
});

describe('trạng thái + hỏi lại', () => {
  it('isInFlight / isApplied', () => {
    expect(['Pending', 'Pushing'].every(isInFlight)).toBe(true);
    expect(['Synced', 'Failed', 'Local', undefined].some((s) => isInFlight(s))).toBe(false);
    expect(['Synced', 'Local'].every(isApplied)).toBe(true);
    expect(isApplied('Failed')).toBe(false);
  });

  it('shouldPoll: còn chờ đẩy và mới tạo (≤ 10 phút) hoặc vừa bấm Thử lại', () => {
    expect(shouldPoll(undefined, NOW)).toBe(false);
    expect(shouldPoll([adj()], NOW)).toBe(true);
    expect(shouldPoll([adj({ status: 'Pushing' })], NOW)).toBe(true);
    expect(shouldPoll([adj({ status: 'Synced' }), adj({ id: 'a2', status: 'Failed' })], NOW)).toBe(false);
    const old = adj({ createdAt: new Date(NOW - POLL_WINDOW_MS - 1).toISOString() });
    expect(shouldPoll([old], NOW)).toBe(false);
    expect(shouldPoll([old], NOW, NOW - 5_000)).toBe(true);
    expect(shouldPoll([old], NOW, NOW - POLL_WINDOW_MS - 1)).toBe(false);
  });

  it('newlyApplied: chỉ khi một lần đang chờ chuyển sang đã nhận', () => {
    expect(newlyApplied(undefined, [adj({ status: 'Synced' })])).toBe(false);
    expect(newlyApplied([adj()], [adj({ status: 'Synced' })])).toBe(true);
    expect(newlyApplied([adj({ status: 'Pushing' })], [adj({ status: 'Local' })])).toBe(true);
    expect(newlyApplied([adj()], [adj({ status: 'Failed' })])).toBe(false);
    expect(newlyApplied([adj({ status: 'Synced' })], [adj({ status: 'Synced' })])).toBe(false);
    expect(newlyApplied([adj()], [adj(), adj({ id: 'new', status: 'Synced' })])).toBe(false);
  });

  it('sortRecent: mới nhất lên đầu, không đổi mảng gốc', () => {
    const items = [adj({ id: 'old', createdAt: '2026-10-01T01:00:00Z' }), adj({ id: 'new', createdAt: '2026-10-02T01:00:00Z' })];
    expect(sortRecent(items).map((a) => a.id)).toEqual(['new', 'old']);
    expect(items[0]!.id).toBe('old');
  });

  it('reasonLabel: lý do lạ giữ nguyên', async () => {
    expect(reasonLabel('Damaged')).toBe('Hư hỏng');
    await useLocaleStore.getState().setPreference('en');
    expect(reasonLabel('Missing')).toBe('Short delivery');
    expect(reasonLabel('Theft')).toBe('Theft');
  });
});

describe('API chỉnh tồn', () => {
  it('POST /products/{id}/stock-adjustments, GET danh sách, POST retry', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { id: 'a1', status: 'Pending' } });
    const get = jest.spyOn(axios, 'get').mockResolvedValue({ data: [adj()] });
    const body = { branchId: 1001, mode: 'Delta' as const, quantity: -2, reason: 'Damaged' as const, note: 'vỡ', clientRequestId: 'req-1' };

    await expect(createStockAdjustment('p1', body)).resolves.toEqual({ id: 'a1', status: 'Pending' });
    expect(post).toHaveBeenCalledWith('/products/p1/stock-adjustments', body);

    await expect(getStockAdjustments('p1')).resolves.toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/products/p1/stock-adjustments');

    await retryStockAdjustment('a1');
    expect(post).toHaveBeenLastCalledWith('/kiotviet/push/stock-adjustments/a1/retry');
  });
});

describe('stockAdjustmentsQuery', () => {
  it('KiotViet vừa nhận (Pending → Synced) → tải lại tồn hàng hoá; còn chờ thì hỏi lại mỗi 3 giây', async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    qc.setQueryData(stockAdjustmentsKey('p1'), [adj()]);
    jest.spyOn(axios, 'get').mockResolvedValue({ data: [adj({ status: 'Synced', kvOnHandAfter: 10 })] });

    const opts = stockAdjustmentsQuery(qc, 'p1');
    expect(opts.queryKey).toEqual(['erp', 'stock-adjustments', 'p1']);
    await opts.queryFn();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['erp', 'product'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['erp', 'products'] });

    const pending = [adj({ createdAt: new Date().toISOString() })];
    expect(opts.refetchInterval({ state: { data: pending } })).toBe(POLL_INTERVAL_MS);
    expect(opts.refetchInterval({ state: { data: [adj({ status: 'Synced' })] } })).toBe(false);
    qc.clear();
  });

  it('không có lần nào vừa xong → không tải lại hàng hoá', async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: [adj({ status: 'Failed', error: 'KiotViet 400' })] });
    await stockAdjustmentsQuery(qc, 'p2').queryFn();
    expect(invalidate).not.toHaveBeenCalled();
    qc.clear();
  });
});
