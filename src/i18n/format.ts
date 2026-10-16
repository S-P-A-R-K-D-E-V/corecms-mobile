import { getLocale, t } from './index';

// ----------------------------------------------------------------------
// Định dạng số tiền theo cửa hàng. Đơn vị tiền tệ lấy từ cửa hàng đang đăng nhập (store-config →
// setStoreCurrency); dấu phân cách theo ngôn ngữ đang dùng. VND giữ đúng kiểu cũ của app
// ("6.400.000đ") khi giao diện tiếng Việt.
// ----------------------------------------------------------------------

let storeCurrency = 'VND';

export function setStoreCurrency(currency: string | null | undefined) {
  storeCurrency = (currency || 'VND').toUpperCase();
}

export function getStoreCurrency(): string {
  return storeCurrency;
}

const intlLocale = () => (getLocale() === 'vi' ? 'vi-VN' : 'en-US');

/** Số tiền đầy đủ: 6.400.000đ (vi, VND) · ₫6,400,000 (en, VND) · $1,234.50 (USD). */
export function formatMoney(value?: number | null, currency = storeCurrency): string {
  const n = Number(value ?? 0);
  if (currency === 'VND' && getLocale() === 'vi') return `${Math.round(n).toLocaleString('vi-VN')}đ`;
  try {
    // Số tròn không hiện ".00"; số lẻ hiện 2 chữ số (trừ VND không có xu).
    const fraction = currency === 'VND' || Number.isInteger(n) ? 0 : 2;
    return new Intl.NumberFormat(intlLocale(), {
      style: 'currency',
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(n);
  } catch {
    return `${n.toLocaleString(intlLocale())} ${currency}`;
  }
}

/** Số thường theo ngôn ngữ đang dùng: 1.234 (vi) · 1,234 (en). */
export function formatNumber(value?: number | null, maximumFractionDigits = 0): string {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits }).format(n);
  } catch {
    return String(Math.round(n));
  }
}

/**
 * Rút gọn số lớn: 4,9tr / 411k / 1,2 tỷ (vi — dấu phẩy thập phân như tiền Việt) · 4.9M / 411K (en). Hàng nghìn làm
 * tròn số nguyên (411k, không phải 410,6k). Không kèm ký hiệu tiền.
 */
export function formatCompact(value?: number | null): string {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  const decimal = getLocale() === 'vi' ? ',' : '.';
  const unit = (div: number, suffix: string, digits: number) => {
    // Làm tròn (4.85 → 4.9; toFixed cho 4.8 vì sai số dấu phẩy động).
    const f = 10 ** digits;
    const v = Math.round((n / div) * f) / f;
    return `${String(v).replace('.', decimal)}${suffix}`;
  };
  if (abs >= 1_000_000_000) return unit(1_000_000_000, t('format.billion'), 1);
  if (abs >= 1_000_000) return unit(1_000_000, t('format.million'), 1);
  // 999.600 làm tròn thành "1000k" → đưa lên hàng triệu.
  if (abs >= 999_500) return unit(1_000_000, t('format.million'), 1);
  if (abs >= 1_000) return unit(1_000, t('format.thousand'), 0);
  return `${n}`;
}
