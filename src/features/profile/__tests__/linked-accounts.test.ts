jest.mock('src/components/overlay', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('src/features/auth/apple-sign-in', () => ({ signInWithApple: jest.fn() }));

import { toast } from 'src/components/overlay';
import { parseLinkResult } from 'src/features/auth/web-link';
import { useLocaleStore } from 'src/i18n';
import { hasApiErrorCode } from 'src/services/error';
import {
  announceLinkResult,
  isProviderLinked,
  linkErrorMessage,
  PROVIDER_ALREADY_LINKED,
  type OAuthConnection,
} from '../use-linked-accounts';

// Mỗi tài khoản một Google + một Apple: BE trả 409 Auth.ProviderAlreadyLinked, trang auth trả
// reason=provider_already_linked về app.

const conflict = { status: 409, title: 'Tài khoản đã liên kết một tài khoản Google khác.', errorCodes: [PROVIDER_ALREADY_LINKED] };

const conn = (provider: string): OAuthConnection => ({ id: provider, provider, email: null, connectedAt: '2026-10-01T00:00:00Z' });

beforeEach(async () => {
  jest.clearAllMocks();
  await useLocaleStore.getState().setPreference('vi');
});

describe('hasApiErrorCode', () => {
  it('đọc mã từ errorCodes (409) và từ khoá errors (400)', () => {
    expect(hasApiErrorCode(conflict, PROVIDER_ALREADY_LINKED)).toBe(true);
    expect(hasApiErrorCode({ errors: { [PROVIDER_ALREADY_LINKED]: ['x'] } }, PROVIDER_ALREADY_LINKED)).toBe(true);
    expect(hasApiErrorCode({ errorCodes: ['Auth.Other'] }, PROVIDER_ALREADY_LINKED)).toBe(false);
    expect(hasApiErrorCode('Something went wrong', PROVIDER_ALREADY_LINKED)).toBe(false);
    expect(hasApiErrorCode(null, PROVIDER_ALREADY_LINKED)).toBe(false);
  });
});

describe('linkErrorMessage', () => {
  it('409 đã liên kết → câu riêng theo ngôn ngữ app', async () => {
    expect(linkErrorMessage(conflict, 'google')).toBe(
      'Tài khoản đã liên kết một Google khác. Mỗi loại chỉ liên kết được một tài khoản — gỡ liên kết hiện tại rồi thử lại.'
    );
    await useLocaleStore.getState().setPreference('en');
    expect(linkErrorMessage(conflict, 'apple')).toBe(
      'A different Apple account is already linked. You can link only one of each — remove the current one, then try again.'
    );
  });

  it('lỗi khác giữ câu của API', () => {
    expect(linkErrorMessage({ title: 'Mã liên kết hết hạn' }, 'google')).toBe('Mã liên kết hết hạn');
  });
});

describe('isProviderLinked', () => {
  it('không phân biệt hoa thường', () => {
    expect(isProviderLinked([conn('Google')], 'google')).toBe(true);
    expect(isProviderLinked([conn('apple')], 'google')).toBe(false);
    expect(isProviderLinked([], 'apple')).toBe(false);
  });
});

describe('parseLinkResult', () => {
  it('nhận reason đã biết khi lỗi', () => {
    expect(parseLinkResult({ status: 'error', provider: 'google', reason: 'provider_already_linked' })).toEqual({
      status: 'error',
      provider: 'google',
      reason: 'provider_already_linked',
    });
    // Trang auth có thể gửi `result` thay cho `status`.
    expect(parseLinkResult({ result: 'error', provider: 'apple', reason: 'provider_already_linked' })).toMatchObject({
      status: 'error',
      reason: 'provider_already_linked',
    });
  });

  it('bỏ reason/provider lạ, không hiện nguyên văn tham số', () => {
    expect(parseLinkResult({ status: 'error', provider: '<b>hi</b>', reason: 'đã có lỗi' })).toEqual({
      status: 'error',
      provider: null,
      reason: null,
    });
    expect(parseLinkResult({ status: 'linked', provider: 'google', reason: 'provider_already_linked' })).toEqual({
      status: 'linked',
      provider: 'google',
      reason: null,
    });
    expect(parseLinkResult({})).toEqual({ status: 'error', provider: null, reason: null });
  });
});

describe('announceLinkResult', () => {
  it('reason provider_already_linked → báo rõ thay cho câu chung', () => {
    announceLinkResult({ status: 'error', provider: 'google', reason: 'provider_already_linked' });
    expect(toast.error).toHaveBeenCalledWith(
      'Tài khoản đã liên kết một Google khác. Mỗi loại chỉ liên kết được một tài khoản — gỡ liên kết hiện tại rồi thử lại.'
    );
  });

  it('lỗi không rõ lý do → câu chung', () => {
    announceLinkResult({ status: 'error', provider: null, reason: null });
    expect(toast.error).toHaveBeenCalledWith('Không liên kết được tài khoản. Vui lòng thử lại.');
  });

  it('liên kết xong → báo thành công', () => {
    announceLinkResult({ status: 'linked', provider: 'apple', reason: null });
    expect(toast.success).toHaveBeenCalledWith('Đã liên kết Apple.');
  });
});
