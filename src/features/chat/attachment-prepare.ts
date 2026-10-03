import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo';

import {
  attachmentKind,
  base64ToBytes,
  bytesToBase64,
  fileNameFor,
  fitWithin,
  nameFromUri,
  planImageProcessing,
  resolveContentType,
  sniffContentType,
  type AttachmentKind,
  type ImagePlan,
} from './attachment-rules';
import { scrubJpegLocation } from './image-metadata';

// ----------------------------------------------------------------------
// Chuẩn bị tệp trước khi xin presigned URL: xác định đúng loại (magic bytes), mọi ảnh tĩnh vẽ lại một lần để bỏ
// EXIF/GPS (HEIC → JPEG, cạnh dài ≤ 2048px, JPEG 0.7), đọc dung lượng thật của tệp sẽ gửi. Dùng chung cho chat,
// ảnh gửi trợ lý và ảnh minh chứng vệ sinh. Bản app chưa có bộ nén: JPEG vẫn được xoá GPS trên bytes (image-metadata).
// ----------------------------------------------------------------------

type Manipulator = typeof import('expo-image-manipulator');

let manipulator: Manipulator | null | undefined;

/**
 * expo-image-manipulator là module native mới thêm: chỉ có trong bản build sau khi thêm gói. Bản app cũ nhận
 * JS qua OTA (runtimeVersion theo appVersion) thì không có → bỏ qua bước nén, không được crash lúc import.
 */
function getImageManipulator(): Manipulator | null {
  if (manipulator !== undefined) return manipulator;
  try {
    manipulator = requireOptionalNativeModule('ExpoImageManipulator')
      ? // eslint-disable-next-line global-require
        (require('expo-image-manipulator') as Manipulator)
      : null;
  } catch {
    manipulator = null;
  }
  return manipulator;
}

/** Máy có bộ nén ảnh → picker lấy ảnh chất lượng gốc rồi tự nén một lần; không thì để picker nén. */
export function canProcessImages(): boolean {
  return getImageManipulator() !== null;
}

/** quality cho expo-image-picker: có bộ nén → lấy bản gốc (nén một lần ở prepareAttachment); không thì để picker nén. */
export function imagePickerQuality(fallback: number): number {
  return canProcessImages() ? 1 : fallback;
}

export type PickedAttachment = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  width?: number;
  height?: number;
  source: 'image' | 'document';
};

/** Ảnh từ expo-image-picker (thư viện / camera) → đầu vào prepareAttachment. */
export function pickedImage(asset: {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  width?: number;
  height?: number;
}): PickedAttachment {
  return {
    uri: asset.uri,
    name: asset.fileName,
    mimeType: asset.mimeType,
    size: asset.fileSize,
    width: asset.width,
    height: asset.height,
    source: 'image',
  };
}

export type PreparedAttachment = {
  uri: string;
  name: string;
  contentType: string;
  size: number;
  kind: AttachmentKind;
};

async function readHead(uri: string): Promise<Uint8Array | null> {
  try {
    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64, position: 0, length: 16 });
    return base64ToBytes(b64);
  } catch {
    return null;
  }
}

/**
 * Loại ảnh thật theo magic bytes (null = không đọc được / không nhận ra). Android: picker nén (quality < 1)
 * ra JPEG nhưng vẫn báo mimeType gốc image/heic | image/webp — phải tin bytes, không tin nhãn.
 */
export async function sniffFileType(uri: string): Promise<string | null> {
  const head = await readHead(uri);
  return head ? sniffContentType(head) : null;
}

// Phần đầu tệp đủ chứa metadata JPEG (mỗi đoạn EXIF/XMP ≤ 64 KB) — đọc thử trước, chỉ đọc cả tệp khi có vị trí.
const JPEG_HEAD_BYTES = 192 * 1024;
let scrubSeq = 0;

/**
 * Đường lùi khi không vẽ lại được ảnh: xoá GPS/XMP ngay trên bytes JPEG. Không có gì để xoá → giữ tệp cũ; có →
 * ghi bản đã xoá ra tệp mới trong cache. Đọc / ghi lỗi → ném lỗi: không gửi ảnh có thể còn vị trí.
 */
async function stripJpegLocation(uri: string): Promise<string> {
  const Base64 = FileSystem.EncodingType.Base64;
  const head = base64ToBytes(await FileSystem.readAsStringAsync(uri, { encoding: Base64, position: 0, length: JPEG_HEAD_BYTES }));
  const probe = scrubJpegLocation(head);
  if (!probe.changed && probe.complete) return uri;

  const all = base64ToBytes(await FileSystem.readAsStringAsync(uri, { encoding: Base64 }));
  if (!scrubJpegLocation(all).changed) return uri;
  if (!FileSystem.cacheDirectory) throw new Error('attachment-prepare: không có thư mục cache');
  const out = `${FileSystem.cacheDirectory}anh_sach_${Date.now()}_${scrubSeq++}.jpg`;
  await FileSystem.writeAsStringAsync(out, bytesToBase64(all), { encoding: Base64 });
  return out;
}

async function fileSize(uri: string, fallback: number): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number') return info.size;
  } catch {}
  return fallback;
}

async function processImage(M: Manipulator, uri: string, plan: ImagePlan): Promise<{ uri: string; contentType: string }> {
  const ctx = M.ImageManipulator.manipulate(uri);
  const original = await ctx.renderAsync();
  const owned: { release(): void }[] = [ctx, original];
  let out = original;
  try {
    // Kích thước thật sau khi xoay theo EXIF (số của picker có thể bị đảo) — chỉ thu nhỏ, giữ tỉ lệ.
    const target = fitWithin(original.width, original.height, plan.maxEdge);
    if (target.resized) {
      const resized = M.ImageManipulator.manipulate(original).resize({ width: target.width, height: target.height });
      owned.push(resized);
      out = await resized.renderAsync();
      owned.push(out);
    }
    const saved = await out.saveAsync({
      compress: plan.compress,
      format: plan.format === 'png' ? M.SaveFormat.PNG : M.SaveFormat.JPEG,
    });
    return { uri: saved.uri, contentType: plan.format === 'png' ? 'image/png' : 'image/jpeg' };
  } finally {
    // Giải phóng bitmap ngay (ảnh 12MP ~48MB RAM) thay vì chờ GC.
    for (const o of owned) {
      try {
        o.release();
      } catch {}
    }
  }
}

/**
 * Chuẩn bị một tệp. Không ném lỗi khi loại không hợp lệ — trả về để validateAttachments báo rõ tên tệp
 * (vd. HEIC trên bản app chưa có bộ nén). Chỉ ném khi không đọc được tệp ảnh để xoá vị trí.
 */
export async function prepareAttachment(p: PickedAttachment): Promise<PreparedAttachment> {
  const originalName = p.name || nameFromUri(p.uri);
  let uri = p.uri;
  let contentType = resolveContentType(originalName, p.mimeType);
  let size = p.size ?? 0;

  if (p.source === 'image') {
    const sniffed = await sniffFileType(uri);
    if (sniffed) contentType = sniffed;
    const plan = contentType ? planImageProcessing({ contentType, width: p.width, height: p.height, size }) : null;
    const M = plan ? getImageManipulator() : null;
    let redrawn = false;
    if (plan && M) {
      try {
        const out = await processImage(M, uri, plan);
        uri = out.uri;
        contentType = out.contentType;
        size = 0;
        redrawn = true;
      } catch {
        // Không xử lý được (ảnh hỏng / thiếu bộ giải mã): gửi ảnh gốc nếu server nhận loại đó; HEIC sẽ bị
        // validateAttachments chặn kèm hướng dẫn.
      }
    }
    // Không vẽ lại được (bản app chưa có bộ nén / vẽ lại lỗi): JPEG vẫn phải bỏ vị trí trước khi gửi.
    if (!redrawn && contentType === 'image/jpeg') uri = await stripJpegLocation(uri);
  }

  const type = contentType ?? 'application/octet-stream';
  return {
    uri,
    name: fileNameFor(originalName, type, p.source === 'image' ? 'anh' : 'tep'),
    contentType: type,
    size: await fileSize(uri, size),
    kind: attachmentKind(type),
  };
}
