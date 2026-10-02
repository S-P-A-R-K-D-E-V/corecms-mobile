import { hasApiErrorCode } from 'src/services/error';
import type { StoreLookup } from 'src/services/store-config';

// ----------------------------------------------------------------------
// Quy tắc thuần (không UI, không gọi mạng) của trang đăng nhập bản cửa hàng — tách riêng để test:
//   - nút nào hiện trên nền tảng nào,
//   - chuẩn hoá ô "Mã hoặc tên miền cửa hàng",
//   - sau khi tìm được các cửa hàng của tài khoản (app-hub/discover) thì vào thẳng / chọn / báo lỗi,
//   - đổi mã lỗi (tra cửa hàng, đăng nhập trực tiếp trên tên miền cửa hàng) sang khoá i18n.
// ----------------------------------------------------------------------

export type SignInButtons = {
  google: boolean;
  /** Sign in with Apple native — chỉ iOS (Android ẩn Apple, chủ quyết định 2026-10-01). */
  apple: boolean;
  email: boolean;
};

/**
 * Nút đăng nhập theo nền tảng: iOS có Apple → Google, Apple, email; còn lại Google, email. Ba nút xếp dọc,
 * mỗi nút cả hàng, cao bằng nhau (HIG + guideline 4.8: Apple không nhỏ / kém nổi hơn Google). Không đặt
 * Google + Apple chung một hàng: nửa hàng (~160pt) không đủ cho "Continue with Google/Apple" — chữ Google
 * co còn ~10pt, chữ trong nút Apple native cũng bị co / cắt.
 */
export function signInButtons(os: string, appleAvailable: boolean): SignInButtons {
  const apple = os === 'ios' && appleAvailable;
  return { google: true, apple, email: true };
}

/** Cao chuẩn của nút đăng nhập (bằng nút Apple native mặc định). */
export const SIGN_IN_BUTTON_HEIGHT = 50;
const SIGN_IN_BUTTON_MAX_HEIGHT = 64;

/**
 * Chiều cao chung của nút Google / Apple / email theo cỡ chữ (cỡ chữ hệ thống × cỡ chữ trong app): chữ to
 * thì cả ba nút cùng cao thêm (tối đa 64) — nút Apple native vẽ chữ theo chiều cao nên chữ Apple cũng to
 * theo, và Apple không bao giờ thấp hơn Google.
 */
export function signInButtonHeight(fontScale: number): number {
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  return Math.min(SIGN_IN_BUTTON_MAX_HEIGHT, Math.max(SIGN_IN_BUTTON_HEIGHT, Math.round(SIGN_IN_BUTTON_HEIGHT * scale)));
}

/**
 * Ô cửa hàng: bỏ khoảng trắng hai đầu và ký tự vô hình (dán từ tin nhắn hay dính), chữ thường. Giữ nguyên
 * phần còn lại (mã, tên miền hoặc nguyên link) — lookupStore tự nhận dạng. Rỗng = người dùng không nhập
 * (cho phép: app tự tìm các cửa hàng của tài khoản).
 */
export function normalizeStoreField(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
}

type StoreLike = { code: string; host?: string | null };

export type StoreChoice =
  /** Vào thẳng cửa hàng này. */
  | { kind: 'enter'; code: string }
  /** Nhiều cửa hàng → màn chọn cửa hàng (cửa hàng dùng gần nhất đứng đầu). */
  | { kind: 'pick' }
  /** Tài khoản hợp lệ nhưng chưa thuộc cửa hàng nào. */
  | { kind: 'none' }
  /** Người dùng đã gõ một cửa hàng mà tài khoản không thuộc cửa hàng đó. */
  | { kind: 'not_member' };

const same = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Chọn đường đi sau discover.
 * - Không chỉ định cửa hàng: 0 → none, 1 → vào thẳng, nhiều → chọn.
 * - Có chỉ định (mã/tên miền người dùng gõ, hoặc cửa hàng của trang đăng nhập): có trong danh sách → vào
 *   thẳng cửa hàng đó. Không có:
 *     'strict' (người dùng gõ mã) → not_member — không tự vào cửa hàng khác;
 *     'prefer' (trang đăng nhập của một cửa hàng, đăng nhập Google) → 0 → none, còn lại → chọn (không
 *     tự vào một cửa hàng khác trang đang mở).
 */
export function chooseStore(
  stores: readonly StoreLike[],
  wanted?: StoreLike | null,
  mode: 'strict' | 'prefer' = 'strict'
): StoreChoice {
  if (wanted) {
    const match = stores.find((s) => same(s.code, wanted.code) || same(s.host, wanted.host));
    if (match) return { kind: 'enter', code: match.code };
    if (mode === 'strict') return { kind: 'not_member' };
    return stores.length === 0 ? { kind: 'none' } : { kind: 'pick' };
  }
  if (stores.length === 0) return { kind: 'none' };
  if (stores.length === 1) return { kind: 'enter', code: stores[0]!.code };
  return { kind: 'pick' };
}

type LookupReason = Extract<StoreLookup, { ok: false }>['reason'];

const LOOKUP_KEY: Record<LookupReason, string> = {
  invalid: 'storeSelect.invalid',
  not_found: 'storeSelect.notFound',
  suspended: 'storeSelect.suspended',
  rate_limited: 'emailSignIn.tooMany',
  network: 'common.network',
};

/** Lỗi tra cửa hàng (lookupStore) → khoá i18n. */
export function storeLookupErrorKey(reason: LookupReason): string {
  return LOOKUP_KEY[reason] ?? 'common.error';
}

/** axios (src/api/axios.ts) từ chối bằng chuỗi này khi không có phản hồi (mất mạng / máy chủ không trả lời). */
const NO_RESPONSE = 'Something went wrong';

/**
 * Lỗi đăng nhập trực tiếp trên tên miền cửa hàng (email + mật khẩu POST /auth/login, Apple POST
 * /auth/oauth-login) → khoá i18n. null = lỗi lạ → hiện thông báo của máy chủ (extractApiError).
 */
export function directLoginErrorKey(err: unknown): string | null {
  if (err === NO_RESPONSE) return 'common.network';
  if (hasApiErrorCode(err, 'Auth.InvalidCred')) return 'emailSignIn.invalid';
  if (hasApiErrorCode(err, 'Auth.NotMemberOfTenant')) return 'signIn.notMemberHere';
  if (hasApiErrorCode(err, 'Auth.InvalidOAuthToken') || hasApiErrorCode(err, 'Auth.UnsupportedProvider')) return 'welcome.signInFailed';
  if (hasApiErrorCode(err, 'User.EmailNotVerified')) return 'emailSignIn.notVerified';
  if (hasApiErrorCode(err, 'User.AccountNotActive')) return 'emailSignIn.notActive';
  if (hasApiErrorCode(err, 'User.AccountBanned')) return 'emailSignIn.banned';
  if (err && typeof err === 'object' && (err as { status?: unknown }).status === 429) return 'emailSignIn.tooMany';
  return null;
}

/**
 * Apple trên trang của một cửa hàng: đăng nhập thẳng vào cửa hàng này (/auth/oauth-login — giữ được cửa hàng
 * cho tự đăng ký, tự thêm thành viên) trước. Chỉ khi máy chủ báo Apple ID này không vào được cửa hàng này
 * (không phải thành viên / Apple không trả email để khớp tài khoản) mới tìm các cửa hàng của Apple ID đó
 * (app-hub/discover): có cửa hàng khác → chọn, không có → lời nhắn rõ trên trang (kèm gợi ý "Ẩn email").
 */
export function shouldDiscoverAfterStoreOAuth(err: unknown): boolean {
  return (
    hasApiErrorCode(err, 'Auth.NotMemberOfTenant') ||
    hasApiErrorCode(err, 'Auth.ExternalEmailMissing') ||
    hasApiErrorCode(err, 'Auth.ExternalEmailNotVerified')
  );
}
