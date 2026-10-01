import { create } from 'zustand';

// ----------------------------------------------------------------------
// Màu chính (primary) theo cửa hàng — bản cửa hàng SaaS lấy TenantBranding.PrimaryColor của cửa hàng
// đang mở; CiCi và lúc chưa chọn cửa hàng dùng hồng CiCi. Từ MỘT mã hex sinh cả bảng màu kiểu Minimal
// (lighter → darker, như theme web) và đẩy vào biến CSS --color-primary* mà tailwind (tokens.js) đọc,
// nên mọi class bg-primary / text-primary / bg-primary-soft… đổi theo mà không phải sửa từng màn.
// Code cần mã hex (icon, gradient, shadow) đọc brand.primary (getter — src/theme/index.ts).
// ----------------------------------------------------------------------

type Rgb = [number, number, number];

export type PrimaryPalette = {
  main: string;
  50: string;
  100: string;
  200: string;
  400: string;
  700: string;
  900: string;
  lighter: string;
  light: string;
  darker: string;
  /** Sáng hơn main — chữ/biểu tượng primary trên nền tối (dark mode). */
  dark: string;
};

export const DEFAULT_PRIMARY = '#C84D71';

/** Bảng hồng CiCi tinh chỉnh tay (tokens.js cũ) — giữ đúng từng mã khi màu là hồng CiCi. */
const CICI_ROSE: PrimaryPalette = {
  main: '#C84D71',
  50: '#FBEAF0',
  100: '#F6D2DF',
  200: '#EBA9BE',
  400: '#D86A88',
  700: '#AC3C5D',
  900: '#7E2A43',
  lighter: '#F6D2DF',
  light: '#E892AD',
  darker: '#7E2A43',
  dark: '#E97AA0',
};

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

export function parseHex(hex: string | null | undefined): Rgb | null {
  if (!hex) return null;
  const m = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function toHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

/** Trộn a với b theo tỉ lệ t (0 = a, 1 = b). */
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Bảng màu từ một mã hex. Màu quá sáng (vàng, xanh nhạt…) được làm đậm dần tới khi chữ trắng trên nền
 * primary đọc được (tương phản ≥ 3:1 — nút, nhãn lớn). Mã không hợp lệ → hồng CiCi.
 */
export function buildPrimaryPalette(hex: string | null | undefined): PrimaryPalette {
  let base = parseHex(hex) ?? parseHex(DEFAULT_PRIMARY)!;
  if (toHex(base) === DEFAULT_PRIMARY) return CICI_ROSE;

  for (let i = 0; i < 20 && contrastRatio(base, WHITE) < 3; i++) base = mix(base, BLACK, 0.06);

  return {
    main: toHex(base),
    50: toHex(mix(base, WHITE, 0.9)),
    100: toHex(mix(base, WHITE, 0.78)),
    200: toHex(mix(base, WHITE, 0.55)),
    400: toHex(mix(base, WHITE, 0.18)),
    700: toHex(mix(base, BLACK, 0.15)),
    900: toHex(mix(base, BLACK, 0.4)),
    lighter: toHex(mix(base, WHITE, 0.78)),
    light: toHex(mix(base, WHITE, 0.35)),
    darker: toHex(mix(base, BLACK, 0.4)),
    dark: toHex(mix(base, WHITE, 0.28)),
  };
}

const channels = (hex: string) => (parseHex(hex) ?? [0, 0, 0]).join(' ');

/** "#RRGGBB" + độ trong → "rgba(r,g,b,a)" (nền mờ theo màu cửa hàng: tab đang chọn, viền…). */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex) ?? [0, 0, 0];
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Biến CSS cho NativeWind `vars()` — khớp tên trong tokens.js. */
export function paletteVars(p: PrimaryPalette): Record<string, string> {
  return {
    '--color-primary': channels(p.main),
    '--color-primary-50': channels(p[50]),
    '--color-primary-100': channels(p[100]),
    '--color-primary-200': channels(p[200]),
    '--color-primary-400': channels(p[400]),
    '--color-primary-700': channels(p[700]),
    '--color-primary-900': channels(p[900]),
    '--color-primary-lighter': channels(p.lighter),
    '--color-primary-light': channels(p.light),
    '--color-primary-darker': channels(p.darker),
    '--color-primary-dark': channels(p.dark),
  };
}

type BrandColorState = { palette: PrimaryPalette };

export const useBrandColor = create<BrandColorState>(() => ({ palette: CICI_ROSE }));

/** Bảng màu đang dùng — đọc lúc render (brand.primary là getter qua hàm này). */
export function getPrimaryPalette(): PrimaryPalette {
  return useBrandColor.getState().palette;
}

/** Đổi màu chính (null = mặc định). Không đổi gì nếu cùng màu — tránh dựng lại cây màn hình. */
export function applyBrandColor(hex: string | null | undefined) {
  const palette = buildPrimaryPalette(hex);
  if (palette.main === getPrimaryPalette().main) return;
  useBrandColor.setState({ palette });
}
