import { extensionOf, normalizeMime } from 'src/features/chat/attachment-rules';
import type { CleaningPhotoFile } from 'src/api/cleaning';

// ----------------------------------------------------------------------
// Ảnh/video minh chứng vệ sinh — phần thuần (test được). Ảnh đi qua prepareAttachment như ảnh chat (vẽ lại: bỏ
// EXIF/GPS, HEIC → JPEG); video gửi nguyên tệp. Loại nhận khớp core-be CleaningController._allowedMediaTypes:
// iOS thư viện ảnh mặc định trả HEIC — server không nhận, app phải đổi trước khi xin presigned URL.
// ----------------------------------------------------------------------

export const CLEANING_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const CLEANING_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp'] as const;

const ACCEPTED = new Set<string>([...CLEANING_IMAGE_TYPES, ...CLEANING_VIDEO_TYPES]);

const VIDEO_EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  '3gp': 'video/3gpp',
};

export function isAcceptedCleaningMedia(type: string | null | undefined): boolean {
  return !!type && ACCEPTED.has(type);
}

/** Tệp đầu tiên server sẽ từ chối (vd. ảnh HEIC trên bản app chưa có bộ nén) — null = gửi được cả lô. */
export function firstRejectedCleaningMedia<T extends Pick<CleaningPhotoFile, 'type'>>(files: readonly T[]): T | null {
  return files.find((f) => !isAcceptedCleaningMedia(f.type)) ?? null;
}

/**
 * Video từ thư viện: loại theo picker, thiếu thì theo đuôi tệp (.mov của iPhone là video/quicktime, không phải mp4);
 * tên dự phòng khi picker không báo tên.
 */
export function cleaningVideoFile(
  asset: { uri: string; fileName?: string | null; mimeType?: string | null },
  index: number,
  now = Date.now()
): CleaningPhotoFile {
  const declared = normalizeMime(asset.mimeType);
  const ext = extensionOf(asset.fileName) ?? extensionOf(asset.uri.split('?')[0]);
  const type = declared?.startsWith('video/') ? declared : (ext && VIDEO_EXT_TO_MIME[ext]) || 'video/mp4';
  const fallbackExt = type === 'video/quicktime' ? 'mov' : type === 'video/webm' ? 'webm' : type === 'video/3gpp' ? '3gp' : 'mp4';
  return { uri: asset.uri, name: asset.fileName || `cleaning_${now}_${index}.${fallbackExt}`, type };
}
