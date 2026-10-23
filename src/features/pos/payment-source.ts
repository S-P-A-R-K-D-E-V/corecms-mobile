import type { IPosPaymentConnection, IQrPayment } from 'src/types/erp';

import type { PosPaymentConfig } from './payment-config';

// ----------------------------------------------------------------------
// Nguồn chuyển khoản ở quầy + mã QR động qua kết nối S Payment — phần thuần của PaymentPanel (giống quầy web
// pos-qr-payment.tsx / payment-connection-select).
//   - Nguồn: '' = theo tài khoản (VietQR tĩnh, nhân viên tự tích đã nhận tiền); khoá kết nối = QR động, tiền về là tự xác
//     nhận. Chọn sẵn: mặc định chủ cửa hàng đặt (còn dùng được) → lựa chọn máy này nhớ → theo tài khoản; chủ cửa hàng tắt
//     "theo tài khoản" thì lấy kết nối đầu tiên.
//   - Mã QR động: tạo cho (số tiền, nguồn); đổi số tiền / nguồn → tự tạo lại, còn hủy / hết hạn / lỗi với cùng số tiền
//     thì chờ nhân viên bấm tạo mã mới. COMPLETED = đã nhận đủ — không tạo lại nữa.
// ----------------------------------------------------------------------

/** Máy nhớ nguồn đã chọn lần trước (khoá kết nối; không lưu = theo mặc định). Cửa hàng khác không có khoá đó thì bỏ qua. */
export const POS_SOURCE_PREF_KEY = 'pref.posPaymentSource';

/** Nguồn "theo tài khoản ngân hàng". */
export const BY_ACCOUNT = '';

/** Khoá lựa chọn: key của core-be (kết nối chưa gắn tài khoản × tài khoản), core-be cũ không có thì id kết nối. */
export const sourceKey = (connection: Pick<IPosPaymentConnection, 'id' | 'key'>) => connection.key || connection.id;

export function sourceUsable(key: string, config: PosPaymentConfig): boolean {
  return key === BY_ACCOUNT ? config.transferSource === 'account' : config.connections.some((c) => sourceKey(c) === key);
}

export function initialSource(config: PosPaymentConfig, saved: string | null | undefined): string {
  if (config.defaultKey != null && sourceUsable(config.defaultKey, config)) return config.defaultKey;
  if (saved && sourceUsable(saved, config)) return saved;
  return config.transferSource === 'account' || config.connections.length === 0 ? BY_ACCOUNT : sourceKey(config.connections[0]);
}

/** Cấu hình tới / đổi: nguồn đang chọn còn dùng được thì giữ, không thì chọn sẵn lại. */
export function resolveSource(current: string | null, config: PosPaymentConfig, saved: string | null | undefined): string {
  return current != null && sourceUsable(current, config) ? current : initialSource(config, saved);
}

export type SourceOption = { key: string; connection: IPosPaymentConnection | null };

/** Chip nguồn: "Theo tài khoản" (khi được phép) rồi từng kết nối. */
export function sourceOptions(config: PosPaymentConfig): SourceOption[] {
  const byAccount: SourceOption[] = config.transferSource === 'account' ? [{ key: BY_ACCOUNT, connection: null }] : [];
  return byAccount.concat(config.connections.map((c) => ({ key: sourceKey(c), connection: c })));
}

// ---------------------------------------------------------------------- Mã QR động

export type QrOutcome = 'pending' | 'completed' | 'cancelled' | 'expired';

/** Trạng thái mã (poll / bấm kiểm tra) → quầy làm gì. */
export function qrOutcome(status: string | null | undefined): QrOutcome {
  switch ((status ?? '').toUpperCase()) {
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
    case 'ERRORCORRECTED':
      return 'cancelled';
    case 'EXPIRED':
      return 'expired';
    default:
      return 'pending';
  }
}

/**
 * Mã giao dịch ghi vào hoá đơn khi khách trả bằng mã QR động: mã thanh toán (SP + 7 ký tự) để core-be gắn mã với hoá đơn
 * (LinkQrOrderToSalesOrder); không có mã → số trace ngân hàng, rồi 8 ký tự đầu id (như quầy web).
 */
export function qrTransactionRef(qr: Pick<IQrPayment, 'id' | 'paymentCode' | 'traceNumber'>): string {
  return qr.paymentCode || qr.traceNumber || qr.id.slice(0, 8);
}

/** Số tiền khách đã trả theo mã (đủ tiền mà máy chủ chưa ghi amountReceived → số tiền của mã). */
export function qrPaidAmount(qr: Pick<IQrPayment, 'amount' | 'amountReceived'>): number {
  return Math.max(qr.amountReceived ?? 0, qr.amount);
}

/** Số giây còn lại tới expiresAt (không âm); không có / sai định dạng → null (không đếm ngược). */
export function secondsUntil(expiresAt: string | null | undefined, now: number = Date.now()): number | null {
  if (!expiresAt) return null;
  const at = new Date(expiresAt).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** 75 → "1:15", 3725 → "1:02:05". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(s % 60)}` : `${minutes}:${pad(s % 60)}`;
}

/** Mã được tạo cho số tiền + nguồn này. */
export type QrTarget = { amount: number; source: string };

export const sameTarget = (a: QrTarget | null | undefined, b: QrTarget | null | undefined) =>
  !!a && !!b && a.amount === b.amount && a.source === b.source;

export type DynamicQrPhase = 'idle' | 'creating' | 'active' | 'completed' | 'cancelled' | 'expired' | 'error';

export type DynamicQrState = {
  phase: DynamicQrPhase;
  /** Mã đang hiện / vừa xong (hết hạn vẫn giữ để báo mã thanh toán). */
  qr: IQrPayment | null;
  /** Lần tạo gần nhất. */
  target: QrTarget | null;
  error: string | null;
};

export const IDLE_QR: DynamicQrState = { phase: 'idle', qr: null, target: null, error: null };

export type DynamicQrAction =
  | { type: 'create'; target: QrTarget }
  | { type: 'created'; target: QrTarget; qr: IQrPayment }
  | { type: 'failed'; target: QrTarget; error: string }
  /** Trạng thái mới của mã (poll / bấm kiểm tra). */
  | { type: 'status'; status: IQrPayment }
  /** Nhân viên huỷ mã. */
  | { type: 'cancelled' }
  | { type: 'reset' };

export function dynamicQrReducer(state: DynamicQrState, action: DynamicQrAction): DynamicQrState {
  switch (action.type) {
    case 'create':
      return { phase: 'creating', qr: null, target: action.target, error: null };
    case 'created':
      // Trả lời của lần tạo cũ (đã đổi số tiền / nguồn tiếp) → bỏ; hook huỷ mã đó trên máy chủ.
      return sameTarget(state.target, action.target) && state.phase === 'creating'
        ? { phase: 'active', qr: action.qr, target: action.target, error: null }
        : state;
    case 'failed':
      return sameTarget(state.target, action.target) && state.phase === 'creating'
        ? { ...state, phase: 'error', error: action.error }
        : state;
    case 'status': {
      if (!state.qr || state.qr.id.toLowerCase() !== action.status.id.toLowerCase()) return state;
      if (state.phase !== 'active' && state.phase !== 'expired') return state;
      const qr: IQrPayment = { ...state.qr, ...action.status, connectionId: action.status.connectionId ?? state.qr.connectionId };
      const outcome = qrOutcome(action.status.status);
      // Hết hạn mà tiền về trễ (kiểm tra lại) vẫn nhận; còn lại giữ nguyên hết hạn.
      if (state.phase === 'expired' && outcome !== 'completed') return state;
      const phase: DynamicQrPhase = outcome === 'pending' ? 'active' : outcome;
      return { ...state, phase, qr };
    }
    case 'cancelled':
      return { ...state, phase: 'cancelled', qr: null, error: null };
    case 'reset':
      return IDLE_QR;
    default:
      return state;
  }
}

/** Tự tạo mã khi đổi số tiền / nguồn (đã nhận tiền thì thôi); cùng số tiền + nguồn thì chờ nhân viên bấm. */
export function shouldCreateQr(state: DynamicQrState, target: QrTarget): boolean {
  if (target.amount <= 0 || target.source === BY_ACCOUNT) return false;
  if (state.phase === 'completed') return false;
  return !sameTarget(state.target, target);
}

/** Mã còn chờ tiền (bỏ đi thì phải huỷ trên máy chủ). */
export const qrPending = (state: DynamicQrState) => state.phase === 'active' && !!state.qr;

/** Hoàn tất được: mã đã nhận đủ tiền cho tổng hiện tại (tổng đơn tăng sau khi khách trả → chưa đủ). */
export function dynamicQrReady(state: DynamicQrState, total: number): boolean {
  return state.phase === 'completed' && !!state.qr && qrPaidAmount(state.qr) >= total;
}
