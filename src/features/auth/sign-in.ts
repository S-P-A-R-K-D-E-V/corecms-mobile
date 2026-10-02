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
  /** Google + Apple gọn trên MỘT hàng; false = Google một mình cả hàng. */
  oauthRow: boolean;
  email: boolean;
};

/** Nút đăng nhập theo nền tảng: iOS có Apple → Google + Apple cùng hàng; còn lại chỉ Google. Luôn có nút email. */
export function signInButtons(os: string, appleAvailable: boolean): SignInButtons {
  const apple = os === 'ios' && appleAvailable;
  return { google: true, apple, oauthRow: apple, email: true };
}

/**
 * Ô cửa hàng: bỏ khoảng trắng hai đầu và ký tự vô hình (dán từ tin nhắn hay dính), chữ thường. Giữ nguyên
 * phần còn lại (mã, tên miền hoặc nguyên link) — lookupStore tự nhận dạng. Rỗng = người dùng không nhập
 * (cho phép: app tự tìm các cửa hàng của tài khoản).
 */
export function normalizeStoreField(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw.replace(/[​-‍﻿]/g, '').trim().toLowerCase();
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
 * Lỗi đăng nhập email + mật khẩu trực tiếp trên tên miền cửa hàng (POST /auth/login) → khoá i18n.
 * null = lỗi lạ → hiện thông báo của máy chủ (extractApiError).
 */
export function directLoginErrorKey(err: unknown): string | null {
  if (err === NO_RESPONSE) return 'common.network';
  if (hasApiErrorCode(err, 'Auth.InvalidCred')) return 'emailSignIn.invalid';
  if (hasApiErrorCode(err, 'Auth.NotMemberOfTenant')) return 'signIn.notMemberHere';
  if (hasApiErrorCode(err, 'User.EmailNotVerified')) return 'emailSignIn.notVerified';
  if (hasApiErrorCode(err, 'User.AccountNotActive')) return 'emailSignIn.notActive';
  if (hasApiErrorCode(err, 'User.AccountBanned')) return 'emailSignIn.banned';
  if (err && typeof err === 'object' && (err as { status?: unknown }).status === 429) return 'emailSignIn.tooMany';
  return null;
}
