import * as Crypto from 'expo-crypto';

import { extractApiError, hasApiErrorCode } from 'src/services/error';
import { t } from 'src/i18n';
import type {
  ICreateStockAdjustmentRequest,
  IStockAdjustment,
  StockAdjustmentMode,
  StockAdjustmentReason,
} from 'src/types/erp';

// ----------------------------------------------------------------------
// Sửa tồn (chủ cửa hàng): phần logic không dính giao diện — đọc số nhập, tính tồn mới, kiểm tra, mã lỗi,
// khi nào cần hỏi lại trạng thái đẩy KiotViet. Màn hình: StockAdjustSheet + StockAdjustmentHistory.
// ----------------------------------------------------------------------

export const STOCK_REASONS: readonly StockAdjustmentReason[] = ['Count', 'Damaged', 'Missing', 'Other'];

/** BE: chưa bật đẩy tồn sang KiotViet (KiotVietStockPush:Enabled=false) — cửa hàng nối KiotViet nhận 409 này. */
export const PUSH_DISABLED = 'StockAdjustment.PushDisabled';

/** Tối đa 3 chữ số thập phân (khớp validator BE). */
const MAX_DECIMALS = 3;

/** Còn chờ đẩy sang KiotViet. */
export const isInFlight = (status?: string | null) => status === 'Pending' || status === 'Pushing';

/** Tồn đã đổi xong (KiotViet nhận, hoặc cửa hàng không nối KiotViet). */
export const isApplied = (status?: string | null) => status === 'Synced' || status === 'Local';

/**
 * Đọc số người dùng gõ (không dấu, ≥ 0): "12", "12,5", "12.5". Dấu cộng/trừ chọn bằng nút riêng vì bàn
 * phím số của iOS không có dấu trừ. Sai định dạng / quá 3 chữ số thập phân → null.
 */
export function parseQuantity(text: string): number | null {
  const s = text.trim().replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const decimals = s.split('.')[1]?.length ?? 0;
  if (decimals > MAX_DECIMALS) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Lượng gửi BE: Set = số đếm được; Delta = ±lượng. */
export function signedQuantity(mode: StockAdjustmentMode, amount: number, sign: 1 | -1): number {
  return mode === 'Set' ? amount : sign * amount;
}

/** Tồn sau khi chỉnh, tính trên tồn đang thấy trên app (BE tính lại trên tồn KiotViet lúc đẩy). */
export function previewOnHand(current: number, mode: StockAdjustmentMode, quantity: number): number {
  return round3(mode === 'Set' ? quantity : current + quantity);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type StockAdjustProblem = 'invalid' | 'zeroDelta' | 'negative';

/**
 * Kiểm tra trước khi gửi; null = gửi được. Đặt số bằng đúng tồn đang thấy vẫn cho gửi — số trên app có thể
 * lệch KiotViet, kiểm kê xác nhận lại là hợp lệ.
 */
export function validateAdjustment(current: number, mode: StockAdjustmentMode, quantity: number | null): StockAdjustProblem | null {
  if (quantity === null || (mode === 'Set' && quantity < 0)) return 'invalid';
  if (mode === 'Delta' && quantity === 0) return 'zeroDelta';
  if (previewOnHand(current, mode, quantity) < 0) return 'negative';
  return null;
}

/**
 * Giữ nguyên clientRequestId khi gửi lại ĐÚNG nội dung cũ (lần trước lỗi mạng / hết giờ — có thể BE đã nhận),
 * đổi nội dung thì sinh id mới. Trả về hàm lấy id cho payload sắp gửi.
 */
export function createRequestIdKeeper(newId: () => string = Crypto.randomUUID) {
  let last: { key: string; id: string } | null = null;
  return {
    idFor(payload: Omit<ICreateStockAdjustmentRequest, 'clientRequestId'>): string {
      const key = JSON.stringify([payload.branchId, payload.mode, payload.quantity, payload.reason, payload.note ?? '']);
      if (!last || last.key !== key) last = { key, id: newId() };
      return last.id;
    },
    /** Gửi thành công → lần sau (phiếu mới) luôn id mới. */
    reset() {
      last = null;
    },
  };
}

/** Câu báo lỗi khi gửi: 409 chưa bật đẩy tồn → câu riêng theo ngôn ngữ app; lỗi khác giữ câu của API. */
export function stockAdjustErrorMessage(err: unknown): string {
  if (hasApiErrorCode(err, PUSH_DISABLED)) return t('erp.stockAdj.pushDisabled');
  return extractApiError(err);
}

/** Thôi hỏi lại trạng thái sau chừng này (worker có thể đang dừng — Pending mãi). */
export const POLL_WINDOW_MS = 10 * 60_000;
export const POLL_INTERVAL_MS = 3_000;

/**
 * Có lần chỉnh còn chờ đẩy, tạo gần đây (hoặc vừa bấm gửi / "Thử lại" lúc `kickedAt`) → hỏi lại danh sách
 * định kỳ. Quá 10 phút thì thôi: worker có thể đang dừng, lần chỉnh nằm Pending tới khi sweeper chạy lại.
 */
export function shouldPoll(items: IStockAdjustment[] | undefined, now = Date.now(), kickedAt?: number): boolean {
  const recent = (ts: number) => Number.isFinite(ts) && now - ts < POLL_WINDOW_MS;
  return (items ?? []).some((a) => isInFlight(a.status) && (recent(new Date(a.createdAt).getTime()) || recent(kickedAt ?? NaN)));
}

/** Lần hỏi này có lần chỉnh nào vừa xong (từ chờ đẩy → đã nhận) → tồn trên app đổi, cần tải lại hàng hoá. */
export function newlyApplied(prev: IStockAdjustment[] | undefined, next: IStockAdjustment[]): boolean {
  if (!prev?.length) return false;
  const before = new Map(prev.map((a) => [a.id, a.status]));
  return next.some((a) => isApplied(a.status) && isInFlight(before.get(a.id)));
}

/**
 * Lần chỉnh máy này vừa gửi / vừa "Thử lại" (`awaiting`) đã ra kết quả chưa: bỏ khỏi danh sách chờ những lần đã
 * xong (nhận hoặc lỗi); true nếu có lần đã nhận → tải lại tồn. Bù cho newlyApplied khi không kịp thấy bước chờ:
 * KiotViet nhận trước lần hỏi đầu tiên, hoặc Failed → Synced ngay sau "Thử lại".
 */
export function settleAwaited(awaiting: Set<string>, next: IStockAdjustment[]): boolean {
  let applied = false;
  for (const a of next) {
    if (!awaiting.has(a.id) || isInFlight(a.status)) continue;
    awaiting.delete(a.id);
    if (isApplied(a.status)) applied = true;
  }
  return applied;
}

/** Mới nhất lên đầu. */
export function sortRecent<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Nhãn lý do (giá trị lạ từ BE giữ nguyên). */
export function reasonLabel(reason: string): string {
  const key = `erp.stockAdj.reason.${reason}`;
  const label = t(key);
  return label === key ? reason : label;
}
