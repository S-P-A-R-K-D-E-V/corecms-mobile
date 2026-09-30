import { vi } from '../locales/vi';
import { en } from '../locales/en';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'string' ? [`${prefix}${k}`] : keys(v as object, `${prefix}${k}.`)
  );
}

function load(variant: 'cici' | 'store') {
  jest.resetModules();
  jest.doMock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { appVariant: variant } } } }));
  // eslint-disable-next-line global-require
  return require('../index') as typeof import('../index');
}

describe('từ điển', () => {
  it('tiếng Anh có đủ mọi khoá của tiếng Việt và ngược lại', () => {
    expect(keys(en).sort()).toEqual(keys(vi).sort());
  });

  it('cùng tham số {…} ở hai ngôn ngữ', () => {
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    const flatVi = Object.fromEntries(keys(vi).map((k) => [k, k.split('.').reduce<any>((a, p) => a[p], vi)]));
    const flatEn = Object.fromEntries(keys(en).map((k) => [k, k.split('.').reduce<any>((a, p) => a[p], en)]));
    for (const k of Object.keys(flatVi)) expect([k, params(flatEn[k])]).toEqual([k, params(flatVi[k])]);
  });
});

describe('t()', () => {
  it('bản CiCi mặc định tiếng Việt như trước', () => {
    const i18n = load('cici');
    expect(i18n.getLocale()).toBe('vi');
    expect(i18n.t('tabs.checkin')).toBe('Điểm danh');
  });

  it('đổi ngôn ngữ và thay tham số', async () => {
    const i18n = load('store');
    await i18n.useLocaleStore.getState().setPreference('en');
    expect(i18n.t('storePicker.subtitle', { email: 'a@b.co' })).toBe('a@b.co belongs to these stores.');
    await i18n.useLocaleStore.getState().setPreference('vi');
    expect(i18n.t('storePicker.subtitle', { email: 'a@b.co' })).toBe('Tài khoản a@b.co thuộc các cửa hàng dưới đây.');
  });

  it('khoá không tồn tại trả lại chính khoá', () => {
    const i18n = load('store');
    expect(i18n.t('khong.co')).toBe('khong.co');
  });
});

describe('định dạng tiền', () => {
  it('VND + tiếng Việt giữ kiểu cũ, tiếng Anh dùng ký hiệu chuẩn', async () => {
    const i18n = load('store');
    // eslint-disable-next-line global-require
    const format = require('../format') as typeof import('../format');
    await i18n.useLocaleStore.getState().setPreference('vi');
    format.setStoreCurrency('VND');
    expect(format.formatMoney(6400000)).toBe('6.400.000đ');
    expect(format.formatCompact(4850000)).toBe('4.9Tr');

    await i18n.useLocaleStore.getState().setPreference('en');
    format.setStoreCurrency('USD');
    expect(format.formatMoney(1234.5)).toBe('$1,234.50');
    expect(format.formatCompact(4850000)).toBe('4.9M');
  });
});
