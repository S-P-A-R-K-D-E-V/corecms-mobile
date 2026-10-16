// Lỗi Counter.* của server chỉ có tiếng Việt: app tiếng Anh dịch theo mã, giữ con số trong câu gốc.

jest.mock('../axios', () => ({ __esModule: true, default: {} }));
jest.mock('src/services/store-config', () => ({ getHostApi: () => '' }));
jest.mock('src/services/counter-mode', () => ({ getCounterKey: async () => null }));

import { setLocale } from 'src/i18n';
import { localizedServerError } from '../counter';

describe('localizedServerError', () => {
  afterAll(() => setLocale('vi'));

  it('tiếng Anh: dịch theo mã, lấy số lần thử còn lại từ câu gốc', () => {
    setLocale('en');
    expect(localizedServerError('Counter.WrongPassword', 'Mật khẩu không đúng — còn 4 lần thử.')).toBe('Wrong password — 4 tries left.');
    expect(localizedServerError('Counter.PasswordLocked', 'Nhập sai…')).toMatch(/^Too many wrong passwords/);
  });

  it('mã lạ hoặc app đang tiếng Việt: giữ câu của server', () => {
    setLocale('en');
    expect(localizedServerError('Counter.SomethingNew', 'x')).toBeNull();
    expect(localizedServerError('User.InvalidOtp', 'x')).toBeNull();
    setLocale('vi');
    expect(localizedServerError('Counter.WrongPassword', 'Mật khẩu không đúng — còn 4 lần thử.')).toBeNull();
  });
});
