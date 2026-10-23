import type { IPosPaymentConnection, IQrPayment } from 'src/types/erp';

import { DEFAULT_POS_PAYMENT_CONFIG, type PosPaymentConfig } from '../payment-config';
import {
  BY_ACCOUNT,
  IDLE_QR,
  dynamicQrReady,
  dynamicQrReducer,
  formatCountdown,
  initialSource,
  qrOutcome,
  qrPaidAmount,
  qrPending,
  qrTransactionRef,
  resolveSource,
  secondsUntil,
  shouldCreateQr,
  sourceKey,
  sourceOptions,
  type DynamicQrState,
} from '../payment-source';

// Nguồn chuyển khoản ở quầy (theo tài khoản / qua kết nối S Payment) + trạng thái mã QR động — giống quầy web.

const conn = (id: string, patch: Partial<IPosPaymentConnection> = {}): IPosPaymentConnection => ({
  id,
  key: id,
  provider: 'apipay',
  kind: 'bank_feed',
  displayName: 'ApiPay',
  accountNumber: '9704229999',
  bankName: 'MB',
  environment: 'live',
  ...patch,
});

const apipay = conn('c1');
// Kết nối ngân hàng trực tiếp chưa gắn tài khoản: một lựa chọn cho mỗi tài khoản cùng ngân hàng.
const vtbA = conn('c2', { key: 'c2:a1', provider: 'vietinbank', kind: 'bank_direct', displayName: 'VietinBank', bankAccountId: 'a1' });

const cfg = (patch: Partial<PosPaymentConfig>): PosPaymentConfig => ({ ...DEFAULT_POS_PAYMENT_CONFIG, connections: [apipay, vtbA], ...patch });

describe('chọn sẵn nguồn chuyển khoản (initialSelection của web)', () => {
  it('mặc định chủ cửa hàng đặt, nếu còn dùng được', () => {
    expect(initialSource(cfg({ defaultKey: 'c2:a1' }), 'c1')).toBe('c2:a1');
    expect(initialSource(cfg({ defaultKey: '' }), 'c1')).toBe(BY_ACCOUNT);
    // Mặc định là kết nối đã tắt → như chưa đặt.
    expect(initialSource(cfg({ defaultKey: 'gone' }), 'c1')).toBe('c1');
    // Mặc định "theo tài khoản" mà chủ cửa hàng tắt theo tài khoản → không dùng được.
    expect(initialSource(cfg({ defaultKey: '', transferSource: 'connectionOnly' }), null)).toBe('c1');
  });

  it('không có mặc định: lựa chọn máy này nhớ (còn trong danh sách), không thì theo tài khoản', () => {
    expect(initialSource(cfg({}), 'c2:a1')).toBe('c2:a1');
    expect(initialSource(cfg({}), 'cũ-đã-tắt')).toBe(BY_ACCOUNT);
    expect(initialSource(cfg({}), null)).toBe(BY_ACCOUNT);
    expect(initialSource(cfg({}), '')).toBe(BY_ACCOUNT);
  });

  it('chủ cửa hàng tắt theo tài khoản: kết nối đầu tiên; không còn nguồn nào → theo tài khoản (bảng tự báo chưa bật)', () => {
    expect(initialSource(cfg({ transferSource: 'connectionOnly' }), null)).toBe('c1');
    expect(initialSource(cfg({ transferSource: 'connectionOnly' }), 'c2:a1')).toBe('c2:a1');
    expect(initialSource(cfg({ transferSource: 'none', connections: [] }), null)).toBe(BY_ACCOUNT);
  });

  it('core-be cũ không có key: khoá = id kết nối', () => {
    const legacy = conn('c9', { key: null });
    expect(sourceKey(legacy)).toBe('c9');
    expect(initialSource(cfg({ connections: [legacy], transferSource: 'connectionOnly' }), null)).toBe('c9');
  });

  it('cấu hình tải lại: nguồn đang chọn còn dùng được thì giữ, bị tắt thì chọn sẵn lại', () => {
    expect(resolveSource('c2:a1', cfg({ defaultKey: 'c1' }), null)).toBe('c2:a1');
    expect(resolveSource('c2:a1', cfg({ connections: [apipay], defaultKey: 'c1' }), null)).toBe('c1');
    expect(resolveSource(null, cfg({ defaultKey: 'c1' }), null)).toBe('c1');
    expect(resolveSource(BY_ACCOUNT, cfg({ transferSource: 'connectionOnly' }), null)).toBe('c1');
  });

  it('chip nguồn: "theo tài khoản" chỉ khi được phép, rồi từng kết nối', () => {
    expect(sourceOptions(cfg({})).map((o) => o.key)).toEqual(['', 'c1', 'c2:a1']);
    expect(sourceOptions(cfg({ transferSource: 'connectionOnly' })).map((o) => o.key)).toEqual(['c1', 'c2:a1']);
    expect(sourceOptions(DEFAULT_POS_PAYMENT_CONFIG)).toEqual([{ key: '', connection: null }]);
  });
});

describe('mã QR động', () => {
  const qr = (patch: Partial<IQrPayment> = {}): IQrPayment => ({
    id: 'Q-1',
    amount: 70_000,
    status: 'INIT',
    paymentCode: 'SPABC2345',
    qrPayload: '000201010212',
    connectionId: 'c1',
    ...patch,
  });
  const target = { amount: 70_000, source: 'c1' };
  const active: DynamicQrState = { phase: 'active', qr: qr(), target, error: null };

  it('trạng thái máy chủ → quầy làm gì', () => {
    expect(qrOutcome('COMPLETED')).toBe('completed');
    expect(qrOutcome('completed')).toBe('completed');
    expect(qrOutcome('CANCELLED')).toBe('cancelled');
    expect(qrOutcome('ERRORCORRECTED')).toBe('cancelled');
    expect(qrOutcome('EXPIRED')).toBe('expired');
    expect(qrOutcome('INIT')).toBe('pending');
    expect(qrOutcome('PENDING')).toBe('pending');
    expect(qrOutcome(undefined)).toBe('pending');
  });

  it('mã giao dịch ghi vào hoá đơn: mã thanh toán SP…, không có thì số trace, rồi 8 ký tự đầu id', () => {
    expect(qrTransactionRef({ id: '0123456789ab', paymentCode: 'SPABC2345', traceNumber: 'FT1' })).toBe('SPABC2345');
    expect(qrTransactionRef({ id: '0123456789ab', paymentCode: null, traceNumber: 'FT1' })).toBe('FT1');
    expect(qrTransactionRef({ id: '0123456789ab' })).toBe('01234567');
  });

  it('tạo mã: bỏ trả lời của lần tạo cũ (đã đổi tổng tiền / nguồn), lỗi thì báo', () => {
    let s = dynamicQrReducer(IDLE_QR, { type: 'create', target });
    expect(s).toMatchObject({ phase: 'creating', qr: null, target });
    // Nhân viên đổi tổng tiền trong lúc chờ → trả lời cho 70k không còn đúng.
    const next = { amount: 82_000, source: 'c1' };
    s = dynamicQrReducer(s, { type: 'create', target: next });
    expect(dynamicQrReducer(s, { type: 'created', target, qr: qr() })).toBe(s);
    s = dynamicQrReducer(s, { type: 'created', target: next, qr: qr({ id: 'Q-2', amount: 82_000 }) });
    expect(s).toMatchObject({ phase: 'active', qr: { id: 'Q-2' }, target: next });

    const failed = dynamicQrReducer(dynamicQrReducer(IDLE_QR, { type: 'create', target }), { type: 'failed', target, error: 'Kết nối đang tắt' });
    expect(failed).toMatchObject({ phase: 'error', error: 'Kết nối đang tắt', target });
  });

  it('poll / kiểm tra: chờ → đã trả (giữ connectionId), huỷ, hết hạn; trạng thái của mã khác thì bỏ', () => {
    expect(dynamicQrReducer(active, { type: 'status', status: qr({ status: 'PENDING', connectionId: undefined }) })).toMatchObject({
      phase: 'active',
      qr: { status: 'PENDING', connectionId: 'c1' },
    });
    const paid = dynamicQrReducer(active, { type: 'status', status: qr({ id: 'q-1', status: 'COMPLETED', amountReceived: 70_000 }) });
    expect(paid).toMatchObject({ phase: 'completed', qr: { status: 'COMPLETED', amountReceived: 70_000 } });
    // Đã trả rồi thì trạng thái sau không đổi gì.
    expect(dynamicQrReducer(paid, { type: 'status', status: qr({ status: 'CANCELLED' }) })).toBe(paid);
    expect(dynamicQrReducer(active, { type: 'status', status: qr({ status: 'ERRORCORRECTED' }) }).phase).toBe('cancelled');
    const expired = dynamicQrReducer(active, { type: 'status', status: qr({ status: 'EXPIRED' }) });
    expect(expired).toMatchObject({ phase: 'expired', qr: { paymentCode: 'SPABC2345' } });
    expect(dynamicQrReducer(active, { type: 'status', status: qr({ id: 'Q-other', status: 'COMPLETED' }) })).toBe(active);
    // Hết hạn: bấm kiểm tra lại mà tiền đã về (trễ) → nhận; còn chờ thì vẫn hết hạn.
    expect(dynamicQrReducer(expired, { type: 'status', status: qr({ status: 'COMPLETED' }) }).phase).toBe('completed');
    expect(dynamicQrReducer(expired, { type: 'status', status: qr({ status: 'PENDING' }) })).toBe(expired);
  });

  it('nhân viên huỷ: bỏ mã; reset về trống', () => {
    expect(dynamicQrReducer(active, { type: 'cancelled' })).toEqual({ phase: 'cancelled', qr: null, target, error: null });
    expect(dynamicQrReducer(active, { type: 'reset' })).toBe(IDLE_QR);
  });

  it('tự tạo mã khi đổi tổng tiền / nguồn; cùng tổng + nguồn thì chờ nhân viên bấm; đã trả thì thôi', () => {
    expect(shouldCreateQr(IDLE_QR, target)).toBe(true);
    expect(shouldCreateQr(active, target)).toBe(false);
    expect(shouldCreateQr(active, { amount: 82_000, source: 'c1' })).toBe(true);
    expect(shouldCreateQr(active, { amount: 70_000, source: 'c2:a1' })).toBe(true);
    expect(shouldCreateQr({ ...active, phase: 'expired' }, target)).toBe(false);
    expect(shouldCreateQr({ ...active, phase: 'cancelled', qr: null }, target)).toBe(false);
    expect(shouldCreateQr({ ...active, phase: 'error' }, target)).toBe(false);
    expect(shouldCreateQr({ ...active, phase: 'completed' }, { amount: 82_000, source: 'c1' })).toBe(false);
    // Không có gì để thu / đang theo tài khoản → không tạo.
    expect(shouldCreateQr(IDLE_QR, { amount: 0, source: 'c1' })).toBe(false);
    expect(shouldCreateQr(IDLE_QR, { amount: 70_000, source: BY_ACCOUNT })).toBe(false);
  });

  it('mã còn chờ tiền (bỏ đi thì huỷ trên máy chủ)', () => {
    expect(qrPending(active)).toBe(true);
    expect(qrPending({ ...active, phase: 'completed' })).toBe(false);
    expect(qrPending({ ...active, phase: 'expired' })).toBe(false);
    expect(qrPending(IDLE_QR)).toBe(false);
  });

  it('hoàn tất được khi mã đã nhận đủ cho tổng hiện tại', () => {
    const paid: DynamicQrState = { ...active, phase: 'completed', qr: qr({ status: 'COMPLETED', amountReceived: 70_000 }) };
    expect(dynamicQrReady(paid, 70_000)).toBe(true);
    // Tổng đơn tăng sau khi khách trả → chưa đủ.
    expect(dynamicQrReady(paid, 82_000)).toBe(false);
    expect(dynamicQrReady(active, 70_000)).toBe(false);
    // Máy chủ chưa ghi amountReceived → tính theo số tiền của mã.
    expect(qrPaidAmount({ amount: 70_000, amountReceived: null })).toBe(70_000);
    expect(qrPaidAmount({ amount: 70_000, amountReceived: 75_000 })).toBe(75_000);
  });

  it('đếm ngược hạn mã', () => {
    const now = Date.parse('2026-10-23T10:00:00Z');
    expect(secondsUntil('2026-10-23T10:01:15Z', now)).toBe(75);
    expect(secondsUntil('2026-10-23T09:59:00Z', now)).toBe(0);
    expect(secondsUntil(null, now)).toBeNull();
    expect(secondsUntil('không phải ngày', now)).toBeNull();
    expect(formatCountdown(75)).toBe('1:15');
    expect(formatCountdown(3725)).toBe('1:02:05');
    expect(formatCountdown(0)).toBe('0:00');
  });
});
