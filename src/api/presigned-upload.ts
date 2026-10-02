// ----------------------------------------------------------------------
// Tải tệp lên R2 bằng presigned URL: app PUT thẳng lên R2, API chỉ nhận objectKey (JSON).
// Luật chủ app: ảnh gửi phải dùng presigned URL, KHÔNG gửi ảnh lên backend (không multipart / FormData qua API,
// không có đường lùi upload qua server). Cùng cách đã chạy ở cleaning.ts / faceEnrollment.ts:
// fetch(uri).blob() rồi fetch PUT.
// ----------------------------------------------------------------------

export type PresignedTarget = {
  objectKey: string;
  uploadUrl: string;
  method?: string;
  /** Header đã được ký (thường chỉ Content-Type) — gửi đúng như vậy. */
  headers?: Record<string, string>;
  expiresAt?: string;
};

/** PUT lên R2 thất bại. status 0 = lỗi mạng (không có phản hồi). */
export class UploadError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Upload failed (${status})`);
    this.name = 'UploadError';
    this.status = status;
  }
}

export function isUploadError(err: unknown): err is UploadError {
  return !!err && typeof err === 'object' && (err as { name?: unknown }).name === 'UploadError';
}

/** Đọc tệp trên máy (file://, content://, ph://…) thành Blob — có kích thước thật (fileSize của picker có thể thiếu). */
export async function readLocalFile(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}

// Không bao giờ gửi kèm: Authorization (URL đã ký, R2 từ chối / lộ token), Host / Content-Length (máy tự đặt).
const NEVER_SEND = /^(authorization|cookie|host|content-length)$/i;

/** PUT blob lên URL đã ký với đúng header server trả về (mặc định chỉ Content-Type). Không 2xx → UploadError. */
export async function putToPresignedUrl(target: PresignedTarget, blob: Blob, contentType: string): Promise<void> {
  const given = Object.entries(target.headers ?? {}).filter(([k]) => !NEVER_SEND.test(k));
  const headers: Record<string, string> = given.length ? Object.fromEntries(given) : { 'Content-Type': contentType };
  let res: Response;
  try {
    res = await fetch(target.uploadUrl, { method: (target.method ?? 'PUT').toUpperCase(), headers, body: blob });
  } catch {
    throw new UploadError(0);
  }
  if (!res.ok) throw new UploadError(res.status);
}
