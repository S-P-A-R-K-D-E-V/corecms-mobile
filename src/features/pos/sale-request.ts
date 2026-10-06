import * as Crypto from 'expo-crypto';

import type { IBankAccount, ICreateSaleRequest, ICreateSaleResponse, PaymentMethod } from 'src/types/erp';

import type { CartLine } from './cart-store';

// ----------------------------------------------------------------------
// Gói tin bán hàng (POST /sales-orders) và mã chống trùng — phần logic không dính giao diện.
//   - `branchRefId`: chi nhánh đang làm việc; `clientRequestId`: uuid sinh lúc bấm "Hoàn tất" lần đầu của giỏ.
//     core-be cũ bỏ qua hai trường này; bản mới ghi hoá đơn vào chi nhánh đó và gửi lại cùng mã thì trả về đúng
//     hoá đơn cũ (không tạo hoá đơn thứ hai).
//   - Gửi lại ĐÚNG nội dung cũ (máy chủ từ chối, hết giờ, app bị tắt giữa chừng) dùng lại mã; đổi nội dung thì mã mới.
//   - Hết 15 giây chưa có trả lời = CHƯA BIẾT hoá đơn đã tạo hay chưa: giỏ bị khoá, chỉ được gửi lại đúng gói đã
//     lưu ("đang kiểm tra hoá đơn") cho tới khi máy chủ trả lời dứt khoát.
// ----------------------------------------------------------------------

/** Quá chừng này mà core-be chưa trả lời thì coi là chưa biết kết quả. */
export const SALE_TIMEOUT_MS = 15_000;

/** Nội dung 1 lần bán, chưa gắn mã chống trùng. */
export type SaleDraft = Omit<ICreateSaleRequest, 'clientRequestId'>;

export type SaleRequest = SaleDraft & { clientRequestId: string };

/**
 * sending  — đang gửi (app bị tắt giữa chừng thì lần mở sau coi như unknown);
 * unknown  — hết giờ / mất mạng / máy chủ lỗi: chưa biết hoá đơn đã tạo hay chưa → khoá giỏ, chỉ gửi lại gói này;
 * rejected — máy chủ từ chối (4xx): chắc chắn chưa tạo hoá đơn → sửa giỏ rồi bán lại như thường.
 */
export type PendingSaleStatus = 'sending' | 'unknown' | 'rejected';

export type PendingSale = { request: SaleRequest; status: PendingSaleStatus; startedAt: number };

/** Lần bán còn treo: giỏ không được sửa và không được bắt đầu lần bán khác. */
export const isSaleInDoubt = (pending: PendingSale | null | undefined) =>
  pending?.status === 'unknown' || pending?.status === 'sending';

export type SalePaymentInput = { method: PaymentMethod; account?: IBankAccount; transferRef?: string };

/** Gói tin từ giỏ hàng — một phương thức thanh toán cho đủ tổng tiền (như trước), thêm chi nhánh đang làm việc. */
export function buildSaleDraft(input: {
  lines: readonly CartLine[];
  payment: SalePaymentInput;
  warehouseId?: string;
  /** Id chi nhánh đang làm việc; chưa có thì không gửi (core-be tự xác định như trước). */
  branchRefId?: string | null;
  note?: string;
  soldByName?: string;
}): SaleDraft {
  const { lines, payment } = input;
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const transfer = payment.method === 'Transfer';
  return {
    totalPayment: total,
    method: payment.method,
    warehouseId: input.warehouseId,
    branchRefId: input.branchRefId || undefined,
    note: input.note?.trim() || undefined,
    soldByName: input.soldByName,
    invoiceDetails: lines.map((l) => ({
      productId: l.productId,
      productVariantId: l.variantId,
      productCode: l.code,
      productName: l.name,
      quantity: l.qty,
      price: l.price,
    })),
    payments: [
      {
        method: payment.method,
        amount: total,
        accountId: transfer ? payment.account?.kiotVietId ?? undefined : undefined,
        transactionRef: transfer ? payment.transferRef : undefined,
      },
    ],
  };
}

/** JSON với khoá xếp theo thứ tự, bỏ undefined — hai gói cùng nội dung cho cùng một chuỗi. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Hai lần bán cùng nội dung (so cả gói tin, không tính mã chống trùng). */
export function sameSale(a: SaleDraft, b: SaleDraft): boolean {
  const strip = ({ clientRequestId: _id, ...rest }: SaleDraft & { clientRequestId?: string }) => rest;
  return canonical(strip(a)) === canonical(strip(b));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * uuid mới cho một lần bán (expo-crypto). Máy không cấp được (module vắng / lỗi) thì tự sinh uuid v4 bằng
 * Math.random — lần bán nào cũng phải có mã, đúng dạng uuid để core-be nhận.
 */
export function newRequestId(): string {
  try {
    const id = Crypto.randomUUID();
    if (typeof id === 'string' && UUID.test(id)) return id;
  } catch {
    // rơi xuống cách dự phòng
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Mã chống trùng cho gói sắp gửi: gửi lại đúng nội dung của lần đang treo → giữ mã cũ; khác nội dung → mã mới. */
export function requestIdFor(pending: PendingSale | null | undefined, draft: SaleDraft, newId: () => string = newRequestId): string {
  return pending && sameSale(pending.request, draft) ? pending.request.clientRequestId : newId();
}

export type SaleAttempt =
  /** core-be đã tạo (hoặc trả lại) hoá đơn. */
  | { kind: 'created'; sale: ICreateSaleResponse }
  /** core-be trả lời từ chối — chắc chắn chưa có hoá đơn; `error` là body để hiện lý do. */
  | { kind: 'rejected'; error: unknown }
  /** Không có trả lời dùng được (hết giờ, mất mạng, 5xx) — chưa biết hoá đơn đã tạo hay chưa. */
  | { kind: 'unknown' };

/**
 * Đọc kết quả thô của POST /sales-orders. Chỉ coi là đã tạo khi 2xx VÀ body có `id` (trang chặn của mạng wifi
 * hay proxy trả 200 không phải câu trả lời của core-be); 4xx là từ chối; còn lại là chưa biết.
 */
export function readSaleAttempt(res: { status: number | null; data: unknown }): SaleAttempt {
  const { status, data } = res;
  if (status == null) return { kind: 'unknown' };
  if (status >= 200 && status < 300) {
    const id = data && typeof data === 'object' ? (data as { id?: unknown }).id : undefined;
    return typeof id === 'string' && id ? { kind: 'created', sale: data as ICreateSaleResponse } : { kind: 'unknown' };
  }
  if (status >= 400 && status < 500) return { kind: 'rejected', error: data };
  return { kind: 'unknown' };
}
