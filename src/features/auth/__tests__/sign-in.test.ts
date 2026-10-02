jest.mock('expo-crypto', () => ({ randomUUID: () => '0123-4567-89ab-cdef-0123-4567-89ab-cdef' }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() } }));
const mockEnter = jest.fn(async (_code: string) => true);
jest.mock('../use-enter-store', () => ({ useEnterStore: () => ({ enter: mockEnter, entering: null }) }));

import { act, renderHook } from '@testing-library/react-native';
import { router } from 'expo-router';

import { vi } from 'src/i18n/locales/vi';
import { en } from 'src/i18n/locales/en';
import type { DiscoveredStore } from 'src/api/app-hub';
import { useDiscovery, type Pending } from '../discovery';
import { chooseStore, directLoginErrorKey, normalizeStoreField, signInButtons, storeLookupErrorKey } from '../sign-in';
import { loadLastStoreField, saveLastStoreField, useAfterDiscovery } from '../use-sign-in';

// Trang đăng nhập bản cửa hàng: Google + Apple (iOS) + "Đăng nhập bằng tài khoản email" mở 3 ô
// (mã/tên miền cửa hàng, email, mật khẩu). Sau khi tìm được các cửa hàng của tài khoản: vào thẳng / chọn /
// báo rõ — không bao giờ tự vào một cửa hàng khác cửa hàng người dùng đã gõ.

const lookup = (dict: object, key: string) => key.split('.').reduce<any>((node, part) => node?.[part], dict);

describe('signInButtons', () => {
  it('iOS có Apple → Google + Apple cùng một hàng, luôn có nút email', () => {
    expect(signInButtons('ios', true)).toEqual({ google: true, apple: true, oauthRow: true, email: true });
  });

  it('iOS chưa dùng được Apple → chỉ Google', () => {
    expect(signInButtons('ios', false)).toEqual({ google: true, apple: false, oauthRow: false, email: true });
  });

  it('Android (và web) không hiện Apple dù máy báo có', () => {
    expect(signInButtons('android', true).apple).toBe(false);
    expect(signInButtons('android', true).oauthRow).toBe(false);
    expect(signInButtons('web', true).apple).toBe(false);
  });
});

describe('normalizeStoreField', () => {
  it('bỏ khoảng trắng, ký tự vô hình, chữ thường', () => {
    expect(normalizeStoreField('  Demo  ')).toBe('demo');
    expect(normalizeStoreField('​demo﻿')).toBe('demo');
    expect(normalizeStoreField('CiCi21ChuaLang.vn')).toBe('cici21chualang.vn');
  });

  it('giữ nguyên link để lookupStore tự nhận dạng', () => {
    expect(normalizeStoreField(' https://Demo.store.devbyspark.com/auth/login ')).toBe('https://demo.store.devbyspark.com/auth/login');
  });

  it('rỗng / chỉ khoảng trắng → "" (cho phép bỏ trống)', () => {
    expect(normalizeStoreField('')).toBe('');
    expect(normalizeStoreField('   ')).toBe('');
    expect(normalizeStoreField(null)).toBe('');
    expect(normalizeStoreField(undefined)).toBe('');
  });
});

describe('chooseStore', () => {
  const demo = { code: 'demo', host: 'demo.store.devbyspark.com' };
  const cici = { code: 'cici', host: 'cici.store.devbyspark.com' };
  const shop = { code: 'shop', host: 'shop.store.devbyspark.com' };

  it('không chỉ định cửa hàng: 0 → none, 1 → vào thẳng, nhiều → chọn', () => {
    expect(chooseStore([])).toEqual({ kind: 'none' });
    expect(chooseStore([demo])).toEqual({ kind: 'enter', code: 'demo' });
    expect(chooseStore([demo, cici])).toEqual({ kind: 'pick' });
  });

  it('có chỉ định: vào đúng cửa hàng đó (khớp mã không phân biệt hoa thường, hoặc khớp tên miền)', () => {
    expect(chooseStore([cici, demo], { code: 'DEMO' })).toEqual({ kind: 'enter', code: 'demo' });
    expect(chooseStore([cici, demo], { code: 'khac', host: 'demo.store.devbyspark.com' })).toEqual({ kind: 'enter', code: 'demo' });
  });

  it('strict (người dùng gõ mã): không thuộc cửa hàng đó → not_member, không tự vào cửa hàng khác', () => {
    expect(chooseStore([cici], { code: 'demo' })).toEqual({ kind: 'not_member' });
    expect(chooseStore([cici, shop], { code: 'demo' }, 'strict')).toEqual({ kind: 'not_member' });
    expect(chooseStore([], { code: 'demo' })).toEqual({ kind: 'not_member' });
  });

  it('prefer (Google từ trang của một cửa hàng): có → vào; không có → chọn (kể cả chỉ 1 cửa hàng khác), rỗng → none', () => {
    expect(chooseStore([cici, demo], { code: 'demo' }, 'prefer')).toEqual({ kind: 'enter', code: 'demo' });
    expect(chooseStore([cici], { code: 'demo' }, 'prefer')).toEqual({ kind: 'pick' });
    expect(chooseStore([cici, shop], { code: 'demo' }, 'prefer')).toEqual({ kind: 'pick' });
    expect(chooseStore([], { code: 'demo' }, 'prefer')).toEqual({ kind: 'none' });
  });
});

describe('ánh xạ lỗi → khoá i18n', () => {
  it('lỗi tra cửa hàng', () => {
    expect(storeLookupErrorKey('invalid')).toBe('storeSelect.invalid');
    expect(storeLookupErrorKey('not_found')).toBe('storeSelect.notFound');
    expect(storeLookupErrorKey('suspended')).toBe('storeSelect.suspended');
    expect(storeLookupErrorKey('rate_limited')).toBe('emailSignIn.tooMany');
    expect(storeLookupErrorKey('network')).toBe('common.network');
  });

  it('đăng nhập trực tiếp trên tên miền cửa hàng (ProblemDetails: errors hoặc errorCodes)', () => {
    expect(directLoginErrorKey({ errors: { 'Auth.InvalidCred': ['x'] } })).toBe('emailSignIn.invalid');
    expect(directLoginErrorKey({ errors: { 'Auth.NotMemberOfTenant': ['x'] } })).toBe('signIn.notMemberHere');
    expect(directLoginErrorKey({ errorCodes: ['Auth.NotMemberOfTenant'] })).toBe('signIn.notMemberHere');
    expect(directLoginErrorKey({ errors: { 'User.EmailNotVerified': ['x'] } })).toBe('emailSignIn.notVerified');
    expect(directLoginErrorKey({ errors: { 'User.AccountNotActive': ['x'] } })).toBe('emailSignIn.notActive');
    expect(directLoginErrorKey({ errors: { 'User.AccountBanned': ['x'] } })).toBe('emailSignIn.banned');
    expect(directLoginErrorKey({ status: 429, title: 'Too Many Requests' })).toBe('emailSignIn.tooMany');
    expect(directLoginErrorKey('Something went wrong')).toBe('common.network');
  });

  it('lỗi lạ → null (hiện thông báo của máy chủ)', () => {
    expect(directLoginErrorKey({ status: 500, title: 'Lỗi máy chủ' })).toBeNull();
    expect(directLoginErrorKey(null)).toBeNull();
  });

  it('mọi khoá trả về đều có chữ ở cả tiếng Việt và tiếng Anh', () => {
    const keys = [
      ...(['invalid', 'not_found', 'suspended', 'rate_limited', 'network'] as const).map(storeLookupErrorKey),
      'emailSignIn.invalid',
      'signIn.notMember',
      'signIn.notMemberHere',
      'emailSignIn.notVerified',
      'emailSignIn.notActive',
      'emailSignIn.banned',
      'emailSignIn.tooMany',
      'signIn.emailAccount',
      'signIn.storeLabel',
      'signIn.storeHelp',
      'signIn.noStoreDesc',
      'signIn.noStoreDescNoEmail',
    ];
    for (const key of keys) {
      expect([key, typeof lookup(vi, key)]).toEqual([key, 'string']);
      expect([key, typeof lookup(en, key)]).toEqual([key, 'string']);
    }
  });

  it('nhãn tiếng Anh đúng như chủ app duyệt', () => {
    expect(lookup(en, 'welcome.continueGoogle')).toBe('Continue with Google');
    expect(lookup(en, 'welcome.continueApple')).toBe('Continue with Apple');
    expect(lookup(en, 'signIn.emailAccount')).toBe('Sign in with email account');
    expect(lookup(en, 'signIn.storeLabel')).toBe('Store code or domain');
    expect(lookup(en, 'emailSignIn.email')).toBe('Email');
    expect(lookup(en, 'emailSignIn.password')).toBe('Password');
    expect(lookup(en, 'emailSignIn.submit')).toBe('Sign in');
    expect(lookup(vi, 'signIn.emailAccount')).toBe('Đăng nhập bằng tài khoản email');
    expect(lookup(vi, 'signIn.storeLabel')).toBe('Mã hoặc tên miền cửa hàng');
  });
});

describe('useAfterDiscovery', () => {
  const store = (code: string): DiscoveredStore => ({
    code,
    name: code.toUpperCase(),
    logoUrl: null,
    primaryColor: null,
    host: `${code}.store.devbyspark.com`,
    webOrigin: `https://${code}.store.devbyspark.com`,
    apiBase: `https://${code}.store.devbyspark.com/api`,
    role: 'Admin',
    locale: 'vi',
    currency: 'VND',
    timezone: 'Asia/Ho_Chi_Minh',
    ssoCode: 'sso',
  });
  const pending = (codes: string[], via: Pending['via'] = 'email'): Pending => {
    const p: Pending = {
      state: 's',
      request: via === 'email' ? { email: 'a@b.co', password: 'pw' } : null,
      via,
      result: { email: 'a@b.co', displayName: 'A', stores: codes.map(store) },
      at: Date.now(),
      firstAt: Date.now(),
    };
    useDiscovery.setState({ pending: p, noStore: null });
    return p;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useDiscovery.setState({ pending: null, noStore: null });
  });

  it('đúng cửa hàng người dùng gõ → vào thẳng cửa hàng đó', async () => {
    const { result } = renderHook(() => useAfterDiscovery());
    let out: any;
    await act(async () => {
      out = await result.current.proceed(pending(['cici', 'demo']), { wanted: { code: 'demo' }, notice: false });
    });
    expect(mockEnter).toHaveBeenCalledWith('demo');
    expect(out).toEqual({ choice: { kind: 'enter', code: 'demo' }, entered: true });
  });

  it('nhiều cửa hàng → màn chọn cửa hàng (push, hoặc replace từ màn trung gian)', async () => {
    const { result } = renderHook(() => useAfterDiscovery());
    await act(async () => {
      await result.current.proceed(pending(['cici', 'demo'], 'google'));
    });
    expect(router.push).toHaveBeenCalledWith('/store-picker');
    await act(async () => {
      await result.current.proceed(pending(['cici', 'demo'], 'google'), { nav: 'replace' });
    });
    expect(router.replace).toHaveBeenCalledWith('/store-picker');
    expect(mockEnter).not.toHaveBeenCalled();
  });

  it('OAuth không có cửa hàng nào → lời nhắn trên trang đăng nhập, bỏ kết quả discover', async () => {
    const { result } = renderHook(() => useAfterDiscovery());
    await act(async () => {
      await result.current.proceed(pending([], 'apple'));
    });
    expect(useDiscovery.getState().noStore).toEqual({ email: 'a@b.co', via: 'apple' });
    expect(useDiscovery.getState().pending).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('email: không thuộc cửa hàng đã gõ → không vào đâu, không giữ mật khẩu trong bộ nhớ', async () => {
    const { result } = renderHook(() => useAfterDiscovery());
    let out: any;
    await act(async () => {
      out = await result.current.proceed(pending(['cici']), { wanted: { code: 'demo' }, mode: 'strict', notice: false });
    });
    expect(out.choice).toEqual({ kind: 'not_member' });
    expect(mockEnter).not.toHaveBeenCalled();
    expect(useDiscovery.getState().pending).toBeNull();
    expect(useDiscovery.getState().noStore).toBeNull();
  });
});

describe('nhớ ô cửa hàng', () => {
  it('lưu bản đã chuẩn hoá, bỏ qua giá trị rỗng', async () => {
    await saveLastStoreField('  Demo ');
    expect(await loadLastStoreField()).toBe('demo');
    await saveLastStoreField('   ');
    expect(await loadLastStoreField()).toBe('demo');
  });
});
