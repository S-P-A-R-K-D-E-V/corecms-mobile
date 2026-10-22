import * as FileSystem from 'expo-file-system/legacy';

// ----------------------------------------------------------------------
// PUT tệp trên máy thẳng lên R2 bằng presigned URL (không qua API, không base64). Dùng upload task native của
// expo-file-system (đọc tệp từ đĩa, không nạp cả ảnh vào JS) + thử lại khi mạng chập chờn + hết giờ thì huỷ — trước
// đây fetch() không giới hạn thời gian, mạng 4G yếu là treo rồi báo "Network request failed" (chủ báo 2026-10-22).
// ----------------------------------------------------------------------

export const UPLOAD_TIMEOUT_MS = 30_000;
export const UPLOAD_RETRIES = 2;

/** Câu báo khi tải ảnh lên không được vì mạng (thay cho "Network request failed"). */
export const UPLOAD_NETWORK_MESSAGE = 'Mạng yếu hoặc mất kết nối — ảnh chưa tải lên được. Kiểm tra mạng rồi thử lại.';

export class UploadError extends Error {
  constructor(message: string, readonly status: number | null) {
    super(message);
    this.name = 'UploadError';
  }
}

type UploadOnce = (uploadUrl: string, fileUri: string, contentType: string) => {
  run: () => Promise<{ status: number } | null | undefined>;
  cancel: () => void;
};

const nativeUpload: UploadOnce = (uploadUrl, fileUri, contentType) => {
  const task = FileSystem.createUploadTask(uploadUrl, fileUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  });
  return { run: () => task.uploadAsync(), cancel: () => void task.cancelAsync().catch(() => {}) };
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * PUT một tệp lên URL đã ký. Lỗi mạng / hết giờ / 5xx → thử lại (tối đa `retries` lần, nghỉ tăng dần); 4xx (URL hết hạn,
 * sai chữ ký) → dừng ngay. Hết lượt → UploadError với câu báo dễ hiểu.
 */
export async function putFileToPresignedUrl(
  uploadUrl: string,
  fileUri: string,
  contentType = 'image/jpeg',
  opts: { retries?: number; timeoutMs?: number; upload?: UploadOnce; sleep?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  const retries = opts.retries ?? UPLOAD_RETRIES;
  const timeoutMs = opts.timeoutMs ?? UPLOAD_TIMEOUT_MS;
  const upload = opts.upload ?? nativeUpload;
  const sleep = opts.sleep ?? wait;
  let last: UploadError = new UploadError(UPLOAD_NETWORK_MESSAGE, null);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const once = upload(uploadUrl, fileUri, contentType);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const res = await Promise.race([
        once.run(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            once.cancel();
            reject(new UploadError(UPLOAD_NETWORK_MESSAGE, null));
          }, timeoutMs);
        }),
      ]);
      if (res && res.status >= 200 && res.status < 300) return;
      const status = res?.status ?? 0;
      last = new UploadError(status ? `Tải ảnh lên thất bại (${status}) — thử lại.` : UPLOAD_NETWORK_MESSAGE, status || null);
      if (status >= 400 && status < 500) break;
    } catch {
      last = new UploadError(UPLOAD_NETWORK_MESSAGE, null);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (attempt < retries) await sleep(800 * (attempt + 1));
  }
  throw last;
}

/** Ghi ảnh base64 (có / không tiền tố data:) ra tệp tạm để tải lên R2. */
export async function writeJpegToCache(base64: string): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('Không có thư mục tạm để lưu ảnh.');
  const uri = `${FileSystem.cacheDirectory}checkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  await FileSystem.writeAsStringAsync(uri, base64.replace(/^data:image\/\w+;base64,/, ''), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}
