// Lỗi HTTP giữ lại mã trạng thái + body. Interceptor axios chung chỉ trả body (mất status), nên lệnh nào
// cần phân biệt 400/403/404/5xx (vd. gửi tệp chat) tự ném lỗi này.
export class HttpStatusError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`);
    this.name = 'HttpStatusError';
    this.status = status;
    this.body = body;
  }
}

/** Nhận theo tên (không dựa vào instanceof — lớp con của Error qua Babel không chắc giữ prototype). */
export function isHttpStatusError(err: unknown): err is HttpStatusError {
  return (
    !!err &&
    typeof err === 'object' &&
    (err as { name?: unknown }).name === 'HttpStatusError' &&
    typeof (err as { status?: unknown }).status === 'number'
  );
}
