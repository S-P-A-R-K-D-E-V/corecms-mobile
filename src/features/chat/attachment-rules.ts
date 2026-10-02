// ----------------------------------------------------------------------
// Tệp đính kèm chat — phần thuần (không gọi native), để test được.
// Luồng gửi: xin presigned URL ở core-be → PUT thẳng tệp lên R2 → gửi tin kèm objectKey; ảnh/tệp KHÔNG đi
// qua backend (multipart cũ vướng giới hạn 1 MB của ingress → iOS báo 413). Giới hạn ở đây khớp core-be
// (POST /messenger/conversations/{id}/attachments/presign): server vẫn kiểm lại kích thước / loại / magic bytes.
// ----------------------------------------------------------------------

import { isHttpStatusError } from 'src/api/http-status-error';

export const MB = 1024 * 1024;

export type AttachmentKind = 'image' | 'file';

type TypeRule = { ext: string; kind: AttachmentKind; maxBytes: number };

/** Loại được gửi (content-type chuẩn → đuôi tệp, loại, dung lượng tối đa). */
export const ATTACHMENT_TYPES: Record<string, TypeRule> = {
  'image/jpeg': { ext: 'jpg', kind: 'image', maxBytes: 10 * MB },
  'image/png': { ext: 'png', kind: 'image', maxBytes: 10 * MB },
  'image/webp': { ext: 'webp', kind: 'image', maxBytes: 10 * MB },
  'image/gif': { ext: 'gif', kind: 'image', maxBytes: 10 * MB },
  'application/pdf': { ext: 'pdf', kind: 'file', maxBytes: 20 * MB },
  'application/msword': { ext: 'doc', kind: 'file', maxBytes: 20 * MB },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'file', maxBytes: 20 * MB },
  'application/vnd.ms-excel': { ext: 'xls', kind: 'file', maxBytes: 20 * MB },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'file', maxBytes: 20 * MB },
  'text/plain': { ext: 'txt', kind: 'file', maxBytes: 5 * MB },
  'text/csv': { ext: 'csv', kind: 'file', maxBytes: 5 * MB },
};

/** Loại tài liệu cho DocumentPicker (ảnh chọn qua thư viện ảnh). */
export const DOCUMENT_PICKER_TYPES = Object.keys(ATTACHMENT_TYPES).filter((m) => !m.startsWith('image/'));

export const MAX_FILES_PER_MESSAGE = 10;
export const MAX_TOTAL_BYTES = 50 * MB;
export const MAX_PARALLEL_UPLOADS = 3;
const MAX_FILE_NAME = 200;

// Ảnh: cạnh dài tối đa + chất lượng JPEG khi phải thu nhỏ / chuyển định dạng (~300–700 KB / ảnh, bỏ EXIF/GPS).
export const IMAGE_MAX_EDGE = 2048;
export const IMAGE_JPEG_QUALITY = 0.7;
const JPEG_REENCODE_OVER_BYTES = 1.5 * MB;
const PNG_TO_JPEG_OVER_BYTES = 4 * MB;

/** Ảnh máy xuất ra nhưng server không nhận (Android/web không hiển thị được) — phải chuyển sang JPEG. */
const CONVERTIBLE_IMAGE_TYPES = new Set(['image/heic', 'image/heif', 'image/avif', 'image/tiff', 'image/bmp']);

const MIME_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
  'image/heic-sequence': 'image/heic',
  'image/heif-sequence': 'image/heif',
  'text/comma-separated-values': 'text/csv',
  'text/x-csv': 'text/csv',
  'application/csv': 'text/csv',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
};

// ----------------------------------------------------------------------
// Loại tệp / tên tệp

export function normalizeMime(mime?: string | null): string | null {
  const m = mime?.split(';')[0].trim().toLowerCase();
  if (!m) return null;
  return MIME_ALIASES[m] ?? m;
}

export function extensionOf(name?: string | null): string | null {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : null;
}

/** Tên tệp từ uri (file:///…/IMG_1.jpg?x → IMG_1.jpg). */
export function nameFromUri(uri: string): string {
  const last = uri.split('?')[0].split('#')[0].split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

/**
 * Content-type để xin URL. Ảnh: tin content-type (picker đã chuyển HEIC → JPEG nhưng tên vẫn .HEIC);
 * tài liệu: ưu tiên đuôi tệp (Android hay trả rỗng / octet-stream, .csv có máy báo là ms-excel).
 */
export function resolveContentType(name: string | null | undefined, declared: string | null | undefined): string | null {
  const fromDeclared = normalizeMime(declared);
  if (fromDeclared?.startsWith('image/')) return fromDeclared;
  const ext = extensionOf(name);
  const fromExt = ext ? EXT_TO_MIME[ext] ?? null : null;
  return fromExt ?? fromDeclared;
}

export function attachmentRule(contentType: string | null | undefined): TypeRule | null {
  return (contentType && ATTACHMENT_TYPES[contentType]) || null;
}

export function isConvertibleImage(contentType: string | null | undefined): boolean {
  return !!contentType && CONVERTIBLE_IMAGE_TYPES.has(contentType);
}

export function attachmentKind(contentType: string | null | undefined): AttachmentKind {
  return attachmentRule(contentType)?.kind ?? (contentType?.startsWith('image/') ? 'image' : 'file');
}

/** Tên gửi kèm: bỏ đường dẫn / ký tự điều khiển, đuôi khớp content-type (IMG_1.HEIC + JPEG → IMG_1.jpg), ≤ 200 ký tự. */
export function fileNameFor(name: string | null | undefined, contentType: string, fallbackBase: string, now = Date.now()): string {
  // eslint-disable-next-line no-control-regex
  const base = ((name ?? '').split(/[\\/]/).pop() ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  const dot = base.lastIndexOf('.');
  const stem = (dot > 0 ? base.slice(0, dot) : base).trim() || `${fallbackBase}_${now}`;
  let ext = dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
  const rule = attachmentRule(contentType);
  if (rule && ext !== rule.ext && !(rule.ext === 'jpg' && ext === 'jpeg')) ext = rule.ext;
  const suffix = ext ? `.${ext}` : '';
  return stem.slice(0, MAX_FILE_NAME - suffix.length) + suffix;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`;
  const v = bytes / MB;
  return `${v >= 100 ? Math.round(v) : Number(v.toFixed(1))} MB`;
}

// ----------------------------------------------------------------------
// Nhận diện ảnh theo magic bytes — picker có thể ghi sai loại (Android: ảnh HEIC đã nén thành JPEG vẫn báo
// image/heic; GIF/WEBP bị nén thành JPEG giữ đuôi cũ). Server kiểm magic bytes nên phải gửi đúng loại thật.

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs']);

export function sniffContentType(bytes: Uint8Array): string | null {
  const at = (i: number) => bytes[i] ?? -1;
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(bytes.slice(from, to)));
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (at(0) === 0x89 && ascii(1, 4) === 'PNG') return 'image/png';
  if (ascii(0, 4) === 'GIF8') return 'image/gif';
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (ascii(0, 4) === '%PDF') return 'application/pdf';
  if (ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand === 'mif1' || brand === 'msf1') return 'image/heif';
  }
  return null;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Giải base64 (đoạn đầu tệp đọc bằng expo-file-system) — không phụ thuộc atob của engine. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

// ----------------------------------------------------------------------
// Ảnh: có cần thu nhỏ / chuyển định dạng không

export type ImagePlan = { format: 'jpeg' | 'png'; compress: number; maxEdge: number };

export function planImageProcessing(img: { contentType: string; width?: number; height?: number; size?: number }): ImagePlan | null {
  const longEdge = Math.max(img.width ?? 0, img.height ?? 0);
  const tooBig = longEdge > IMAGE_MAX_EDGE;
  const size = img.size ?? 0;
  const jpeg: ImagePlan = { format: 'jpeg', compress: IMAGE_JPEG_QUALITY, maxEdge: IMAGE_MAX_EDGE };
  if (isConvertibleImage(img.contentType)) return jpeg;
  switch (img.contentType) {
    case 'image/jpeg':
    case 'image/webp':
      return tooBig || size > JPEG_REENCODE_OVER_BYTES ? jpeg : null;
    case 'image/png':
      // PNG nặng gần như luôn là ảnh chụp lưu PNG → JPEG; ảnh chụp màn hình giữ PNG (chữ sắc nét).
      if (size > PNG_TO_JPEG_OVER_BYTES) return jpeg;
      return tooBig ? { format: 'png', compress: 1, maxEdge: IMAGE_MAX_EDGE } : null;
    default:
      return null; // GIF giữ nguyên (ảnh động)
  }
}

/** Kích thước mới giữ tỉ lệ, cạnh dài ≤ maxEdge. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number; resized: boolean } {
  const longEdge = Math.max(width, height);
  if (!(longEdge > maxEdge) || width <= 0 || height <= 0) return { width, height, resized: false };
  const k = maxEdge / longEdge;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), resized: true };
}

// ----------------------------------------------------------------------
// Kiểm tra trước khi xin URL (server kiểm lại; mã lỗi khớp core-be)

export type AttachmentIssue =
  | { code: 'too_many_files'; max: number }
  | { code: 'unsupported_type'; name: string }
  | { code: 'needs_conversion'; name: string }
  | { code: 'empty_file'; name: string }
  | { code: 'attachment_too_large'; name: string; size: number; maxBytes: number }
  | { code: 'total_too_large'; size: number; maxBytes: number };

export function validateAttachments(files: { name: string; contentType: string; size: number }[]): AttachmentIssue | null {
  if (files.length > MAX_FILES_PER_MESSAGE) return { code: 'too_many_files', max: MAX_FILES_PER_MESSAGE };
  let total = 0;
  for (const f of files) {
    const rule = attachmentRule(f.contentType);
    if (!rule) {
      return isConvertibleImage(f.contentType) ? { code: 'needs_conversion', name: f.name } : { code: 'unsupported_type', name: f.name };
    }
    if (!(f.size > 0)) return { code: 'empty_file', name: f.name };
    if (f.size > rule.maxBytes) return { code: 'attachment_too_large', name: f.name, size: f.size, maxBytes: rule.maxBytes };
    total += f.size;
  }
  if (total > MAX_TOTAL_BYTES) return { code: 'total_too_large', size: total, maxBytes: MAX_TOTAL_BYTES };
  return null;
}

// ----------------------------------------------------------------------
// Tiến độ / chạy song song / thử lại

export function batchProgress(items: { size: number; progress: number; uploaded: boolean }[]): { done: number; total: number; percent: number } {
  const totalBytes = items.reduce((s, i) => s + Math.max(i.size, 1), 0);
  const sent = items.reduce((s, i) => s + Math.max(i.size, 1) * (i.uploaded ? 1 : Math.min(Math.max(i.progress, 0), 1)), 0);
  return {
    done: items.filter((i) => i.uploaded).length,
    total: items.length,
    percent: totalBytes > 0 ? Math.floor((sent / totalBytes) * 100) : 0,
  };
}

/** Chạy worker cho từng phần tử, tối đa `limit` việc cùng lúc; kết quả giữ đúng thứ tự, lỗi không chặn việc khác. */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  return results;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: { retries?: number; delaysMs?: number[]; shouldRetry?: (err: unknown) => boolean; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const { retries = 2, delaysMs = [800, 2000], shouldRetry = () => true, sleep = defaultSleep } = opts;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      await sleep(delaysMs[Math.min(attempt, delaysMs.length - 1)] ?? 0);
    }
  }
}

// ----------------------------------------------------------------------
// Lỗi → thông báo. Interceptor axios chung chỉ trả body (mất status) và trả chuỗi khi không có phản hồi,
// nên các lệnh gọi chat giữ status qua HttpStatusError.

export function serverMessageOf(body: unknown): string | undefined {
  if (typeof body === 'string') {
    const s = body.trim();
    return s && s.length <= 300 && !s.startsWith('<') ? s : undefined;
  }
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    for (const k of ['error', 'message', 'detail', 'title']) {
      const v = b[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return undefined;
}

export type UploadStage = 'presign' | 'upload' | 'send';
export type UploadErrorKey = 'network' | 'linkExpired' | 'forbidden' | 'serverOutdated' | 'rejected' | 'failed';
export type UploadErrorInfo = { key: UploadErrorKey; retryable: boolean; serverMessage?: string; status?: number };

export function describeUploadError(err: unknown, stage: UploadStage): UploadErrorInfo {
  if (isHttpStatusError(err)) {
    const { status } = err;
    if (stage === 'upload') {
      if (status === 0) return { key: 'network', retryable: true };
      // R2 trả 403 khi URL hết hạn / chữ ký lệch → xin URL mới rồi tải lại.
      if (status === 400 || status === 403) return { key: 'linkExpired', retryable: true, status };
      return { key: 'failed', retryable: true, status };
    }
    if (status === 400 || status === 409 || status === 413 || status === 422) {
      return { key: 'rejected', retryable: false, serverMessage: serverMessageOf(err.body), status };
    }
    if (status === 403) return { key: 'forbidden', retryable: false, status };
    if (status === 404 || status === 405) {
      // presign chưa có → core-be chưa lên bản mới; gửi tin 404 → hội thoại không còn.
      return stage === 'presign' ? { key: 'serverOutdated', retryable: false, status } : { key: 'forbidden', retryable: false, status };
    }
    if (status === 408 || status === 429 || status >= 500) return { key: 'failed', retryable: true, status };
    return { key: 'failed', retryable: false, serverMessage: serverMessageOf(err.body), status };
  }
  // Không có phản hồi: interceptor trả chuỗi; tải lên R2 lỗi mạng ném Error thường.
  if (typeof err === 'string' || stage === 'upload') return { key: 'network', retryable: true };
  return { key: 'failed', retryable: true };
}
