import { issueMessage, uploadErrorMessage } from '../attachment-messages';
import { MB, type AttachmentIssue, type UploadErrorKey } from '../attachment-rules';

// Mọi thông báo phải tra được chữ thật (không trả lại khoá "chat.attach…").
describe('thông báo gửi tệp chat', () => {
  it('lỗi kiểm tra trước khi gửi', () => {
    const issues: AttachmentIssue[] = [
      { code: 'too_many_files', max: 10 },
      { code: 'unsupported_type', name: 'x.exe' },
      { code: 'needs_conversion', name: 'IMG.HEIC' },
      { code: 'empty_file', name: 'rong.txt' },
      { code: 'attachment_too_large', name: 'to.jpg', size: 12.4 * MB, maxBytes: 10 * MB },
    ];
    for (const issue of issues) expect(issueMessage(issue)).not.toMatch(/^chat\./);
    expect(issueMessage(issues[4])).toBe('“to.jpg” nặng 12.4 MB — tối đa 10 MB.');
  });

  it('lỗi khi tải lên / gửi', () => {
    const keys: UploadErrorKey[] = ['network', 'linkExpired', 'forbidden', 'serverOutdated', 'rejected', 'failed'];
    for (const key of keys) expect(uploadErrorMessage({ key, retryable: false })).not.toMatch(/^chat\./);
    expect(uploadErrorMessage({ key: 'rejected', retryable: false, serverMessage: 'Tệp không đúng định dạng.' })).toBe('Tệp không đúng định dạng.');
  });
});
