// Centralised error handling. The axios response interceptor rejects with the
// raw `error.response.data` (an RFC7807-ish ProblemDetails or a string), so most
// callers receive that shape — `extractApiError` normalises it to a message.

export class AppError extends Error {
  readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.cause = cause;
  }
}

const GENERIC = 'Vui lòng thử lại';

/**
 * Lỗi API có mã `code` không (vd 'Auth.ProviderAlreadyLinked'). BE gắn mã lỗi ErrorOr vào ProblemDetails
 * theo hai kiểu: `errorCodes: [...]` (409/404/500) hoặc làm khoá của `errors` (400 validation).
 */
export function hasApiErrorCode(err: any, code: string): boolean {
  if (!err || typeof err !== 'object') return false;
  if (Array.isArray(err.errorCodes) && err.errorCodes.includes(code)) return true;
  return !!err.errors && typeof err.errors === 'object' && !Array.isArray(err.errors) && code in err.errors;
}

/**
 * Normalise an unknown thrown value into a user-facing Vietnamese message.
 * Mirrors (and replaces) the per-screen `extractApiError` that lived in the
 * legacy check-in screen.
 */
/** Không có phản hồi từ máy chủ / mất mạng (axios trả chuỗi này, fetch ném "Network request failed"). */
const NETWORK = 'Mạng yếu hoặc mất kết nối — kiểm tra mạng rồi thử lại.';
const NETWORK_PATTERN = /^(Something went wrong|Network request failed|Network Error|timeout of \d+ms exceeded)$/i;

export function extractApiError(err: any): string {
  if (!err) return GENERIC;
  if (typeof err === 'string') return NETWORK_PATTERN.test(err) ? NETWORK : err;
  if (err instanceof Error && NETWORK_PATTERN.test(err.message)) return NETWORK;

  // ASP.NET validation errors: { errors: { Field: ["msg", ...] } }
  if (err?.errors && typeof err.errors === 'object' && !Array.isArray(err.errors)) {
    const key = Object.keys(err.errors)[0];
    if (key) {
      const msgs = err.errors[key];
      return Array.isArray(msgs) ? msgs[0] : String(msgs);
    }
  }

  return (
    err?.detail ||
    err?.description ||
    err?.message ||
    (err?.title !== 'One or more validation errors occurred.' ? err?.title : null) ||
    GENERIC
  );
}
