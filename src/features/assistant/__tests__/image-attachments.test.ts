import { HttpStatusError } from 'src/api/http-status-error';
import { UploadError } from 'src/api/presigned-upload';
import { DEFAULT_IMAGE_RULES, checkImage, imageErrorKey, imageRulesOf, isAttachmentRejection } from '../image-attachments';

const rules = DEFAULT_IMAGE_RULES;

describe('checkImage', () => {
  it('JPEG hợp lệ → tên tệp đúng đuôi theo loại', () => {
    expect(checkImage({ name: 'IMG_0001.HEIC', mimeType: 'image/jpeg', size: 812345 }, rules)).toEqual({
      ok: true,
      contentType: 'image/jpeg',
      fileName: 'IMG_0001.jpg',
    });
  });

  it('thiếu mime → đoán theo đuôi', () => {
    expect(checkImage({ name: 'a.png', mimeType: null, size: 10 }, rules)).toMatchObject({ ok: true, contentType: 'image/png' });
  });

  it('HEIC / GIF / ngoài danh sách server → type', () => {
    expect(checkImage({ name: 'a.heic', mimeType: 'image/heic', size: 10 }, rules)).toEqual({ ok: false, reason: 'type' });
    expect(checkImage({ name: 'a.gif', mimeType: 'image/gif', size: 10 }, rules)).toEqual({ ok: false, reason: 'type' });
    expect(checkImage({ name: 'a.jpg', mimeType: 'image/jpeg', size: 10 }, { ...rules, imageTypes: ['image/png'] })).toEqual({
      ok: false,
      reason: 'type',
    });
  });

  it('Android: ảnh HEIC/WebP đã bị picker nén thành JPEG nhưng vẫn báo loại gốc → theo magic bytes', () => {
    expect(checkImage({ name: 'IMG_1.heic', mimeType: 'image/heic', sniffed: 'image/jpeg', size: 10 }, rules)).toEqual({
      ok: true,
      contentType: 'image/jpeg',
      fileName: 'IMG_1.jpg',
    });
    expect(checkImage({ name: 'a.webp', mimeType: 'image/webp', sniffed: 'image/jpeg', size: 10 }, rules)).toMatchObject({
      ok: true,
      contentType: 'image/jpeg',
      fileName: 'a.jpg',
    });
    // Bytes thật là HEIC (iOS không chuyển được) → vẫn chặn dù nhãn là JPEG.
    expect(checkImage({ name: 'a.jpg', mimeType: 'image/jpeg', sniffed: 'image/heic', size: 10 }, rules)).toEqual({ ok: false, reason: 'type' });
  });

  it('quá dung lượng / rỗng', () => {
    expect(checkImage({ name: 'a.jpg', mimeType: 'image/jpeg', size: rules.maxImageBytes + 1 }, rules)).toEqual({ ok: false, reason: 'size' });
    expect(checkImage({ name: 'a.jpg', mimeType: 'image/jpeg', size: 0 }, rules)).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('imageRulesOf', () => {
  it('server cũ / thiếu trường → mặc định', () => {
    expect(imageRulesOf(null)).toEqual(DEFAULT_IMAGE_RULES);
    expect(imageRulesOf({ maxImages: 2, imageTypes: ['image/png'] })).toEqual({ ...DEFAULT_IMAGE_RULES, maxImages: 2, imageTypes: ['image/png'] });
  });
});

describe('lỗi ảnh', () => {
  it('413 / 415 / khác', () => {
    expect(imageErrorKey(new HttpStatusError(413, { code: 'attachment_too_large' }))).toBe('imageTooLarge');
    expect(imageErrorKey(new HttpStatusError(415, { code: 'attachment_type' }))).toBe('imageTypeUnsupported');
    expect(imageErrorKey(new UploadError(403))).toBe('uploadFailed');
    expect(imageErrorKey(new Error('x'))).toBe('uploadFailed');
  });

  it('server từ chối ảnh khi gửi → bỏ ảnh; lỗi mạng / 5xx → giữ', () => {
    expect(isAttachmentRejection(new HttpStatusError(400, { code: 'attachment_invalid' }))).toBe(true);
    expect(isAttachmentRejection(new HttpStatusError(413, null))).toBe(true);
    expect(isAttachmentRejection(new HttpStatusError(400, { code: 'content_too_long' }))).toBe(false);
    expect(isAttachmentRejection(new HttpStatusError(500, null))).toBe(false);
    expect(isAttachmentRejection('Something went wrong')).toBe(false);
  });
});
