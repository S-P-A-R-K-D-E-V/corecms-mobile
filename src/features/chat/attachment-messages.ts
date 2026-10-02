import { t } from 'src/i18n';
import { formatBytes, type AttachmentIssue, type UploadErrorInfo } from './attachment-rules';

// Thông báo cho người dùng khi gửi tệp chat (vi/en qua i18n).

export function issueMessage(issue: AttachmentIssue): string {
  switch (issue.code) {
    case 'too_many_files':
      return t('chat.attach.tooMany', { max: issue.max });
    case 'unsupported_type':
      return t('chat.attach.unsupported', { name: issue.name });
    case 'needs_conversion':
      return t('chat.attach.heic', { name: issue.name });
    case 'empty_file':
      return t('chat.attach.empty', { name: issue.name });
    case 'attachment_too_large':
      return t('chat.attach.tooLarge', { name: issue.name, size: formatBytes(issue.size), max: formatBytes(issue.maxBytes) });
  }
}

export function uploadErrorMessage(info: UploadErrorInfo): string {
  // Lỗi 400 của server đã nói rõ tệp nào / vì sao (vd. "Ảnh … nặng 12,4 MB — tối đa 10 MB.").
  if (info.key === 'rejected' && info.serverMessage) return info.serverMessage;
  return t(`chat.attach.${info.key}`);
}
