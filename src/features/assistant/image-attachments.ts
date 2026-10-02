import { isHttpStatusError } from 'src/api/http-status-error';
import { isUploadError } from 'src/api/presigned-upload';
import { fileNameFor, resolveContentType } from 'src/features/chat/attachment-rules';

// ----------------------------------------------------------------------
// Ảnh gửi kèm câu hỏi trợ lý — phần thuần (test được). Luồng: xin presigned URL → PUT thẳng lên R2 →
// gửi câu hỏi kèm objectKey. Ảnh KHÔNG bao giờ đi qua API. Giới hạn lấy từ GET /chatbot/capabilities.
// ----------------------------------------------------------------------

export const DEFAULT_IMAGE_RULES = {
  maxImages: 4,
  maxImageBytes: 10 * 1024 * 1024,
  imageTypes: ['image/jpeg', 'image/png', 'image/webp'],
};

export type ImageRules = typeof DEFAULT_IMAGE_RULES;

export function imageRulesOf(caps?: { maxImages?: number; maxImageBytes?: number; imageTypes?: string[] } | null): ImageRules {
  return {
    maxImages: caps?.maxImages && caps.maxImages > 0 ? caps.maxImages : DEFAULT_IMAGE_RULES.maxImages,
    maxImageBytes: caps?.maxImageBytes && caps.maxImageBytes > 0 ? caps.maxImageBytes : DEFAULT_IMAGE_RULES.maxImageBytes,
    imageTypes: caps?.imageTypes?.length ? caps.imageTypes : DEFAULT_IMAGE_RULES.imageTypes,
  };
}

export type ImageCheck =
  | { ok: true; contentType: string; fileName: string }
  | { ok: false; reason: 'type' | 'size' | 'empty' };

/** Loại (theo content-type picker, thiếu thì theo đuôi) + dung lượng thật (blob.size). HEIC/HEIF không nhận. */
export function checkImage(
  file: { name?: string | null; mimeType?: string | null; size: number },
  rules: ImageRules
): ImageCheck {
  const contentType = resolveContentType(file.name, file.mimeType);
  if (!contentType || contentType === 'image/heic' || contentType === 'image/heif' || !rules.imageTypes.includes(contentType)) {
    return { ok: false, reason: 'type' };
  }
  if (!(file.size > 0)) return { ok: false, reason: 'empty' };
  if (file.size > rules.maxImageBytes) return { ok: false, reason: 'size' };
  return { ok: true, contentType, fileName: fileNameFor(file.name, contentType, 'IMG') };
}

/** Khoá i18n (assistant.*) cho lỗi xin URL / PUT / gửi kèm ảnh. */
export function imageErrorKey(err: unknown): 'imageTooLarge' | 'imageTypeUnsupported' | 'uploadFailed' {
  const status = isHttpStatusError(err) ? err.status : isUploadError(err) ? err.status : 0;
  const code = isHttpStatusError(err) ? (err.body as { code?: unknown } | null)?.code : undefined;
  if (status === 413 || code === 'attachment_too_large') return 'imageTooLarge';
  if (status === 415 || code === 'attachment_type') return 'imageTypeUnsupported';
  return 'uploadFailed';
}

/** Server từ chối ảnh khi gửi câu hỏi (đã xoá object) → bỏ ảnh khỏi ô soạn, không gửi lại cùng objectKey. */
export function isAttachmentRejection(err: unknown): boolean {
  if (!isHttpStatusError(err)) return false;
  const code = (err.body as { code?: unknown } | null)?.code;
  return err.status === 413 || err.status === 415 || (typeof code === 'string' && code.startsWith('attachment_'));
}
