import { useEffect, useState } from 'react';

import { CustomerDisplayModule } from '../../modules/customer-display';
import { t } from 'src/i18n';
import { formatMoney } from 'src/i18n/format';

// ----------------------------------------------------------------------
// Màn hình khách trên màn phụ của máy quầy (POS Android 2 màn, tablet cắm màn hình ngoài). Các màn trong app báo trạng
// thái vào đây; ưu tiên: đã thanh toán (vài giây) > mã QR chờ khách quét > giỏ hàng > quảng cáo. Trạng thái được định
// dạng sẵn chữ / số tiền rồi gửi sang module native (modules/customer-display) vẽ bằng Presentation. Không có module
// (bản app cũ, iOS) hoặc không cắm màn phụ → không làm gì.
// ----------------------------------------------------------------------

export const PAID_SCREEN_MS = 6_000;

export type DisplayCartLine = { key: string; name: string; detail?: string | null; qty: number; price: number; amount: number };

export type DisplayCart = {
  lines: DisplayCartLine[];
  total: number;
  discount?: number;
  customerName?: string | null;
};

export type DisplayQr = {
  imageUrl: string;
  amount: number;
  bankLine?: string | null;
  note?: string | null;
};

export type DisplayAds = { intervalSeconds: number; slides: { url: string; kind: 'image' | 'video'; title?: string | null }[] };

type State = {
  cart: DisplayCart | null;
  qr: DisplayQr | null;
  paid: { amount: number; until: number } | null;
  ads: DisplayAds | null;
  storeName: string | null;
};

const state: State = { cart: null, qr: null, paid: null, ads: null, storeName: null };
let paidTimer: ReturnType<typeof setTimeout> | undefined;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let lastSent: string | null = null;

/** Gói gửi sang native: chữ và số tiền đã định dạng theo cửa hàng. */
export function buildPayload(s: State, now: number = Date.now()): Record<string, unknown> {
  const base = {
    storeName: s.storeName,
    ads: s.ads ? { interval: s.ads.intervalSeconds, slides: s.ads.slides } : null,
  };
  if (s.paid && s.paid.until > now) {
    return {
      ...base,
      mode: 'paid',
      paid: {
        title: t('customerDisplay.thanks'),
        amount: s.paid.amount > 0 ? t('customerDisplay.paid', { amount: formatMoney(s.paid.amount) }) : '',
      },
    };
  }
  if (s.qr) {
    return {
      ...base,
      mode: 'qr',
      qr: {
        imageUrl: s.qr.imageUrl,
        title: t('customerDisplay.scanToPay'),
        amount: formatMoney(s.qr.amount),
        lines: [s.qr.bankLine, s.qr.note ? t('customerDisplay.transferNote', { note: s.qr.note }) : null].filter(Boolean),
      },
    };
  }
  if (s.cart && s.cart.lines.length > 0) {
    const count = s.cart.lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = s.cart.lines.reduce((n, l) => n + l.amount, 0);
    const totals: { label: string; value: string; strong?: boolean }[] = [
      { label: t('customerDisplay.subtotal', { n: count }), value: formatMoney(subtotal) },
    ];
    if (s.cart.discount) totals.push({ label: t('customerDisplay.discount'), value: `-${formatMoney(s.cart.discount)}` });
    totals.push({ label: t('customerDisplay.total'), value: formatMoney(Math.max(0, s.cart.total)), strong: true });
    return {
      ...base,
      mode: 'cart',
      cart: {
        title: s.storeName ?? t('customerDisplay.yourOrder'),
        customer: s.cart.customerName ? t('customerDisplay.customer', { name: s.cart.customerName }) : null,
        lines: s.cart.lines.map((l) => ({
          name: l.name,
          detail: l.detail ?? null,
          qty: `${l.qty} × ${formatMoney(l.price)}`,
          amount: formatMoney(l.amount),
        })),
        totals,
      },
    };
  }
  return { ...base, mode: 'idle' };
}

function flush() {
  if (!CustomerDisplayModule) return;
  if (flushTimer) clearTimeout(flushTimer);
  // Gõ số lượng / quét mã liên tục: gom lại, vẽ tối đa ~8 lần/giây.
  flushTimer = setTimeout(() => {
    const json = JSON.stringify(buildPayload(state));
    if (json === lastSent) return;
    lastSent = json;
    try {
      CustomerDisplayModule?.render(json);
    } catch {
      // Màn phụ vừa rút ra — lần sau vẽ lại.
    }
  }, 120);
}

export const customerDisplay = {
  get supported() {
    return CustomerDisplayModule != null;
  },
  setCart(cart: DisplayCart | null) {
    state.cart = cart;
    flush();
  },
  setQr(qr: DisplayQr | null) {
    state.qr = qr;
    flush();
  },
  paid(amount: number) {
    state.qr = null;
    state.paid = { amount, until: Date.now() + PAID_SCREEN_MS };
    flush();
    if (paidTimer) clearTimeout(paidTimer);
    paidTimer = setTimeout(() => {
      state.paid = null;
      flush();
    }, PAID_SCREEN_MS + 50);
  },
  setAds(ads: DisplayAds | null, storeName: string | null) {
    state.ads = ads;
    state.storeName = storeName;
    flush();
  },
  setKeepAwake(on: boolean) {
    try {
      CustomerDisplayModule?.setKeepAwake(on);
    } catch {}
  },
  /** Đặt lại (test / đăng xuất). */
  reset() {
    state.cart = null;
    state.qr = null;
    state.paid = null;
    lastSent = null;
    flush();
  },
};

/** Đang cắm màn phụ (loại presentation) không — cập nhật khi cắm / rút. */
export function useCustomerDisplayAvailable(): boolean {
  const [available, setAvailable] = useState(() => {
    try {
      return CustomerDisplayModule?.isAvailable() ?? false;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!CustomerDisplayModule) return undefined;
    const sub = CustomerDisplayModule.addListener('onDisplayChange', (e) => setAvailable(!!e.available));
    return () => sub.remove();
  }, []);
  return available;
}
