import Constants from 'expo-constants';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import 'dayjs/locale/en-gb';
import { create } from 'zustand';

import { prefs, PrefKeys } from 'src/services/storage';
import { vi, type Dict } from './locales/vi';
import { en } from './locales/en';

// ----------------------------------------------------------------------
// i18n gọn nhẹ: tiếng Việt + tiếng Anh. `t('a.b.c', { name })` tra theo đường dẫn, thay {param}; thiếu
// khoá ở ngôn ngữ đang dùng thì lấy tiếng Việt, thiếu nữa thì trả lại khoá.
//
// Ngôn ngữ: người dùng chọn (Cài đặt → Ngôn ngữ) hoặc "theo máy". Mặc định: bản CiCi tiếng Việt như
// trước; bản cửa hàng (toàn cầu) theo ngôn ngữ của máy (vi nếu máy tiếng Việt, còn lại tiếng Anh).
// Đổi ngôn ngữ → root layout dựng lại navigator (key theo locale) nên mọi màn đọc lại chữ mới.
// ----------------------------------------------------------------------

export type Locale = 'vi' | 'en';
export type LanguagePreference = Locale | 'system';

const dictionaries: Record<Locale, Dict> = { vi, en };
const isStoreVariant = (Constants.expoConfig?.extra as { appVariant?: string } | undefined)?.appVariant === 'store';

export function deviceLocale(): Locale {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return tag.toLowerCase().startsWith('vi') ? 'vi' : 'en';
  } catch {
    return 'en';
  }
}

function resolveLocale(preference: LanguagePreference): Locale {
  if (preference !== 'system') return preference;
  return isStoreVariant ? deviceLocale() : 'vi';
}

let activeLocale: Locale = resolveLocale('system');

function apply(locale: Locale) {
  activeLocale = locale;
  // en-gb: tuần bắt đầu thứ Hai như 'vi' — thống kê "tuần này" không đổi theo ngôn ngữ.
  dayjs.locale(locale === 'vi' ? 'vi' : 'en-gb');
}
apply(activeLocale);

type LocaleState = {
  locale: Locale;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => Promise<void>;
};

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: activeLocale,
  preference: 'system',
  setPreference: async (preference) => {
    const locale = resolveLocale(preference);
    apply(locale);
    set({ preference, locale });
    await prefs.set(PrefKeys.language, preference).catch(() => {});
  },
}));

/** Đọc lựa chọn đã lưu — gọi một lần lúc mở app (trước khi hiện màn đầu tiên). */
export async function hydrateLocale(): Promise<void> {
  const saved = await prefs.get(PrefKeys.language).catch(() => null);
  const preference: LanguagePreference = saved === 'vi' || saved === 'en' ? saved : 'system';
  const locale = resolveLocale(preference);
  apply(locale);
  useLocaleStore.setState({ preference, locale });
}

export function getLocale(): Locale {
  return activeLocale;
}

/** @deprecated dùng useLocaleStore().setPreference */
export function setLocale(l: Locale) {
  apply(l);
  useLocaleStore.setState({ locale: l });
}

function resolve(dict: unknown, path: string): string | undefined {
  const value = path.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), dict);
  return typeof value === 'string' ? value : undefined;
}

export function t(path: string, params?: Record<string, string | number>): string {
  const raw = resolve(dictionaries[activeLocale], path) ?? resolve(dictionaries.vi, path);
  if (raw === undefined) return path;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}

/** Hook: component render lại khi đổi ngôn ngữ. */
export function useT() {
  useLocaleStore((s) => s.locale);
  return t;
}
