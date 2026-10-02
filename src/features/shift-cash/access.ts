import { getLocale, t } from 'src/i18n';
import type { GpsBlockReason, GpsStatus } from 'src/hooks/use-gps-gate';
import type { IMyScheduleItem } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Luật vào Kiểm quầy (khớp BE RequireShiftCashAccess):
// - Admin: vào thẳng, xem được ngày cũ.
// - Staff & Manager: phải có ca hôm nay (ngày VN) → rồi đang ở cửa hàng (GPS trong bán kính một chi
//   nhánh, sai số ≤ 200 m, không phải vị trí giả lập) → chỉ làm việc với ngày hôm nay.
// Mọi lỗi kiểm tra (mạng, không tải được chi nhánh) đều CHẶN kèm nút thử lại — không cho qua.
// ----------------------------------------------------------------------

/** Sai số GPS tối đa (mét) — BE check-in & cổng kiểm quầy cùng ngưỡng. */
export const SHIFT_CASH_MAX_ACCURACY_M = 200;

/** Mã lỗi BE trả trong 403 { error, message }. */
export const SHIFT_CASH_ERRORS = {
  noShiftToday: 'ShiftCash.NoShiftToday',
  locationRequired: 'ShiftCash.LocationRequired',
  outsideStore: 'ShiftCash.OutsideStore',
  pastDateAdminOnly: 'ShiftCash.PastDateAdminOnly',
} as const;

const SHIFT_CASH_ERROR_PREFIX = 'ShiftCash.';

export type ShiftCashDenial = { code: string; message: string | null };

/**
 * Lỗi BE từ chối vì luật kiểm quầy? Interceptor axios trả nguyên body: { error: 'ShiftCash.*', message }.
 * Đọc thêm kiểu ProblemDetails (errorCodes / khoá errors) cho chắc. Không phải → null.
 */
export function getShiftCashDenial(err: unknown): ShiftCashDenial | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as Record<string, any>;
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
  if (typeof e.error === 'string' && e.error.startsWith(SHIFT_CASH_ERROR_PREFIX)) {
    return { code: e.error, message: text(e.message) };
  }
  const codes: unknown[] = Array.isArray(e.errorCodes)
    ? e.errorCodes
    : e.errors && typeof e.errors === 'object' && !Array.isArray(e.errors)
      ? Object.keys(e.errors)
      : [];
  const code = codes.find((c): c is string => typeof c === 'string' && c.startsWith(SHIFT_CASH_ERROR_PREFIX));
  return code ? { code, message: text(e.detail) ?? text(e.title) } : null;
}

const DENIAL_KEYS: Record<string, { title: string; message: string }> = {
  [SHIFT_CASH_ERRORS.noShiftToday]: { title: 'shiftCash.gate.noShiftTitle', message: 'shiftCash.gate.noShiftMsg' },
  [SHIFT_CASH_ERRORS.locationRequired]: { title: 'shiftCash.gate.unavailableTitle', message: 'shiftCash.gate.locationRequiredMsg' },
  [SHIFT_CASH_ERRORS.outsideStore]: { title: 'shiftCash.gate.outsideTitle', message: 'shiftCash.gate.outsideMsg' },
  [SHIFT_CASH_ERRORS.pastDateAdminOnly]: { title: 'shiftCash.gate.deniedTitle', message: 'shiftCash.gate.pastDateMsg' },
};

/** Tiêu đề màn chặn khi BE từ chối. */
export function shiftCashDenialTitle(d: ShiftCashDenial): string {
  return t(DENIAL_KEYS[d.code]?.title ?? 'shiftCash.gate.deniedTitle');
}

/** Lý do BE từ chối: câu BE trả (tiếng Việt) khi app tiếng Việt; tiếng Anh thì dịch theo mã nếu biết. */
export function shiftCashDenialMessage(d: ShiftCashDenial): string {
  const key = DENIAL_KEYS[d.code]?.message;
  if (d.message && (getLocale() === 'vi' || !key)) return d.message;
  return t(key ?? 'shiftCash.gate.deniedMsg');
}

// ── Quyết định cổng ─────────────────────────────────────────────────────────

/** Kết quả kiểm tra ca hôm nay. */
export type ShiftCheck = 'loading' | 'error' | 'none' | 'ok';

/**
 * Ca hôm nay từ GET my-schedule (today..today). Đã có ca thì giữ 'ok' cả khi đang tải lại (không đá
 * người đang kiểm đếm ra cổng mỗi lần kéo làm mới); chưa có ca thì tải lại = đang kiểm tra.
 */
export function shiftCheckFrom(
  q: { data?: IMyScheduleItem[]; isFetching: boolean; isError: boolean },
  today: string
): ShiftCheck {
  // BE lọc theo khoảng ngày; vẫn so ngày cho chắc (date "yyyy-MM-dd").
  if (q.data?.some((s) => !s.date || s.date.slice(0, 10) === today)) return 'ok';
  if (q.isFetching) return 'loading';
  if (q.isError || !q.data) return 'error';
  return 'none';
}

export type ShiftCashBlockReason = 'no_shift' | 'shift_error' | GpsBlockReason | 'server';

export type ShiftCashDecision =
  | { state: 'allow' }
  | { state: 'checking'; step: 'shift' | 'location' }
  | { state: 'blocked'; reason: ShiftCashBlockReason };

/**
 * Thứ tự: Admin → BE vừa từ chối → ca hôm nay → GPS. Kiểm tra ca TRƯỚC để người không có ca không bị
 * hỏi quyền vị trí. GPS chỉ cho qua khi đã có vị trí và không có lý do chặn nào.
 */
export function decideShiftCashAccess(input: {
  bypass: boolean;
  serverDenied: boolean;
  shift: ShiftCheck;
  gps: { status: GpsStatus; reason: GpsBlockReason | null };
}): ShiftCashDecision {
  if (input.bypass) return { state: 'allow' };
  if (input.serverDenied) return { state: 'blocked', reason: 'server' };
  if (input.shift === 'loading') return { state: 'checking', step: 'shift' };
  if (input.shift === 'error') return { state: 'blocked', reason: 'shift_error' };
  if (input.shift === 'none') return { state: 'blocked', reason: 'no_shift' };
  if (input.gps.reason) return { state: 'blocked', reason: input.gps.reason };
  if (input.gps.status !== 'ready') return { state: 'checking', step: 'location' };
  return { state: 'allow' };
}
