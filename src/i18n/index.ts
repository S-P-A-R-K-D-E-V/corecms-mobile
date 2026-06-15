import { vi } from './locales/vi';

// Lightweight i18n. VN-only for now but structured for multi-locale: add a new
// locale dict and switch `activeLocale`. `t('a.b.c', { name })` does a dot-path
// lookup with {param} interpolation, falling back to the key if missing.

const locales = { vi };
type Locale = keyof typeof locales;

let activeLocale: Locale = 'vi';

export function setLocale(l: Locale) {
  activeLocale = l;
}

function resolve(dict: unknown, path: string): string | undefined {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), dict);
}

export function t(path: string, params?: Record<string, string | number>): string {
  const raw = resolve(locales[activeLocale], path);
  if (typeof raw !== 'string') return path;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? String(params[k]) : `{${k}}`));
}
