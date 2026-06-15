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
 * Normalise an unknown thrown value into a user-facing Vietnamese message.
 * Mirrors (and replaces) the per-screen `extractApiError` that lived in the
 * legacy check-in screen.
 */
export function extractApiError(err: any): string {
  if (!err) return GENERIC;
  if (typeof err === 'string') return err;

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
