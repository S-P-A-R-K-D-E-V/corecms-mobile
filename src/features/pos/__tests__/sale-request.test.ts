import * as Crypto from 'expo-crypto';

import type { CartLine } from '../cart-store';
import {
  SALE_TIMEOUT_MS,
  buildSaleDraft,
  isSaleInDoubt,
  newRequestId,
  readSaleAttempt,
  requestIdFor,
  sameSale,
  type PendingSale,
} from '../sale-request';

// Gói tin POST /sales-orders: thêm chi nhánh đang làm việc (branchRefId) + mã chống trùng (clientRequestId), phần
// còn lại giữ đúng như app gửi trước đây (core-be cũ bỏ qua hai trường mới).

const lines: CartLine[] = [
  { key: 'p1', productId: 'p1', code: 'K35', name: 'Kẹp tóc - K35', listPrice: 35_000, price: 35_000, qty: 2, stock: 6 },
  { key: 'c1', productId: 'p2', variantId: 'c1', code: 'SC18-D', name: 'Scrunchies - Đen', listPrice: 18_000, price: 15_000, qty: 1, stock: 3 },
];

const cash = { method: 'Cash' as const };

const ids = (...list: string[]) => {
  let i = 0;
  return () => list[i++] ?? `id-${i}`;
};

describe('gói tin bán hàng', () => {
  it('tiền mặt: giữ các trường cũ, thêm chi nhánh đang làm việc', () => {
    const draft = buildSaleDraft({ lines, payment: cash, warehouseId: 'w1', branchRefId: 'b1', note: '  khách quen ', soldByName: 'Lan' });
    expect(draft).toEqual({
      totalPayment: 85_000,
      method: 'Cash',
      warehouseId: 'w1',
      branchRefId: 'b1',
      note: 'khách quen',
      soldByName: 'Lan',
      invoiceDetails: [
        { productId: 'p1', productVariantId: undefined, productCode: 'K35', productName: 'Kẹp tóc - K35', quantity: 2, price: 35_000 },
        { productId: 'p2', productVariantId: 'c1', productCode: 'SC18-D', productName: 'Scrunchies - Đen', quantity: 1, price: 15_000 },
      ],
      payments: [{ method: 'Cash', amount: 85_000, accountId: undefined, transactionRef: undefined }],
    });
  });

  it('chuyển khoản: kèm tài khoản KiotViet + nội dung; chưa có chi nhánh thì không gửi branchRefId', () => {
    const draft = buildSaleDraft({
      lines,
      payment: { method: 'Transfer', account: { id: 'a1', kiotVietId: 77 }, transferRef: 'TT 123456' },
      branchRefId: null,
      note: '   ',
    });
    expect(draft.payments).toEqual([{ method: 'Transfer', amount: 85_000, accountId: 77, transactionRef: 'TT 123456' }]);
    expect(draft.branchRefId).toBeUndefined();
    expect(draft.note).toBeUndefined();
    expect(JSON.parse(JSON.stringify(draft))).not.toHaveProperty('branchRefId');
  });
});

describe('mã chống trùng (clientRequestId)', () => {
  const draft = buildSaleDraft({ lines, payment: cash, branchRefId: 'b1' });
  const pendingOf = (status: PendingSale['status'], id = 'req-1'): PendingSale => ({
    request: { ...draft, clientRequestId: id },
    status,
    startedAt: 0,
  });

  it('lần đầu thanh toán giỏ → sinh mã mới', () => {
    expect(requestIdFor(null, draft, ids('req-1'))).toBe('req-1');
  });

  it('gửi lại ĐÚNG nội dung cũ → giữ mã cũ (dù thứ tự khoá trong gói khác nhau)', () => {
    const same = buildSaleDraft({ lines: lines.map((l) => ({ ...l })), payment: cash, branchRefId: 'b1' });
    const reordered = Object.fromEntries(Object.entries(same).reverse()) as typeof same;
    expect(sameSale(draft, reordered)).toBe(true);
    for (const status of ['rejected', 'unknown', 'sending'] as const) {
      expect(requestIdFor(pendingOf(status), reordered, ids('req-2'))).toBe('req-1');
    }
  });

  it('đổi nội dung (số lượng, giá, phương thức, chi nhánh, ghi chú) → mã mới', () => {
    const changed = [
      buildSaleDraft({ lines: [{ ...lines[0]!, qty: 3 }, lines[1]!], payment: cash, branchRefId: 'b1' }),
      buildSaleDraft({ lines: [{ ...lines[0]!, price: 30_000 }, lines[1]!], payment: cash, branchRefId: 'b1' }),
      buildSaleDraft({ lines, payment: { method: 'Card' }, branchRefId: 'b1' }),
      buildSaleDraft({ lines, payment: cash, branchRefId: 'b2' }),
      buildSaleDraft({ lines, payment: cash, branchRefId: 'b1', note: 'gói quà' }),
    ];
    for (const next of changed) {
      expect(sameSale(draft, next)).toBe(false);
      expect(requestIdFor(pendingOf('rejected'), next, ids('req-2'))).toBe('req-2');
    }
  });

  it('mã là uuid của expo-crypto; máy không cấp được thì tự sinh uuid v4 — không bao giờ thiếu mã', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const randomUUID = jest.spyOn(Crypto, 'randomUUID');

    randomUUID.mockReturnValue('3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b');
    expect(newRequestId()).toBe('3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b');

    randomUUID.mockReturnValue(undefined as any);
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(uuid);
    expect(b).toMatch(uuid);
    expect(a).not.toBe(b);

    randomUUID.mockImplementation(() => {
      throw new Error('native module missing');
    });
    expect(newRequestId()).toMatch(uuid);
    randomUUID.mockRestore();
  });

  it('lần bán đang gửi / chưa biết kết quả là còn treo; bị từ chối thì không', () => {
    expect(isSaleInDoubt(pendingOf('sending'))).toBe(true);
    expect(isSaleInDoubt(pendingOf('unknown'))).toBe(true);
    expect(isSaleInDoubt(pendingOf('rejected'))).toBe(false);
    expect(isSaleInDoubt(null)).toBe(false);
  });
});

describe('đọc kết quả POST /sales-orders', () => {
  it('hết giờ 15 giây', () => {
    expect(SALE_TIMEOUT_MS).toBe(15_000);
  });

  it('2xx có id → đã tạo (kèm trạng thái đẩy KiotViet nếu có)', () => {
    expect(readSaleAttempt({ status: 200, data: { id: 'inv-1', kiotVietSyncStatus: 'NotPushed' } })).toEqual({
      kind: 'created',
      sale: { id: 'inv-1', kiotVietSyncStatus: 'NotPushed' },
    });
    expect(readSaleAttempt({ status: 201, data: { id: 'inv-2' } }).kind).toBe('created');
  });

  it('4xx → máy chủ từ chối, chắc chắn chưa tạo; giữ body để hiện lý do', () => {
    const problem = { title: 'Giá bán không đúng giá niêm yết', status: 400 };
    expect(readSaleAttempt({ status: 400, data: problem })).toEqual({ kind: 'rejected', error: problem });
    expect(readSaleAttempt({ status: 409, data: null }).kind).toBe('rejected');
    expect(readSaleAttempt({ status: 422, data: 'x' }).kind).toBe('rejected');
  });

  it('không có trả lời / 5xx / 2xx không phải của core-be → chưa biết kết quả', () => {
    expect(readSaleAttempt({ status: null, data: 'Something went wrong' })).toEqual({ kind: 'unknown' });
    expect(readSaleAttempt({ status: 500, data: { title: 'Lỗi' } }).kind).toBe('unknown');
    expect(readSaleAttempt({ status: 504, data: null }).kind).toBe('unknown');
    expect(readSaleAttempt({ status: 200, data: '<html>Đăng nhập wifi</html>' }).kind).toBe('unknown');
    expect(readSaleAttempt({ status: 200, data: {} }).kind).toBe('unknown');
    expect(readSaleAttempt({ status: 302, data: null }).kind).toBe('unknown');
  });
});
