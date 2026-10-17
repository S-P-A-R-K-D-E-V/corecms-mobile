import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from './utils';
import { useFontSettings, resolveFontFamily } from 'src/theme/FontProvider';

// Apple type ramp. Existing names (title/subtitle/body/bodySmall/caption/label)
// kept for backward-compat; new names (largeTitle/title2/headline/callout/footnote).
// micro/nano: chữ rất nhỏ trong chip/nhãn ("Sắp có"...) — có lineHeight riêng; đừng dùng
// className="text-[9px]" trên variant mặc định (vẫn mang lineHeight 22px của 'body').
type Variant =
  | 'largeTitle' | 'title' | 'title2' | 'headline' | 'subtitle'
  | 'body' | 'callout' | 'bodySmall' | 'footnote' | 'caption' | 'label' | 'micro' | 'nano';

type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'error' | 'success' | 'warning' | 'inverse';

const variantClass: Record<Variant, string> = {
  largeTitle: 'text-[34px] leading-[41px] font-bold',
  title: 'text-[28px] leading-[34px] font-bold tracking-[-0.4px]',
  title2: 'text-[22px] leading-[28px] font-bold tracking-[-0.3px]',
  headline: 'text-[17px] leading-[22px] font-semibold',
  subtitle: 'text-[17px] leading-[22px] font-semibold',
  body: 'text-[16px] leading-[22px]',
  callout: 'text-[15px] leading-[20px]',
  bodySmall: 'text-[13px] leading-[18px]',
  footnote: 'text-[13px] leading-[18px]',
  caption: 'text-[12px] leading-[16px]',
  label: 'text-[11px] leading-[14px] font-semibold uppercase tracking-[0.4px]',
  micro: 'text-[10px] leading-[13px]',
  nano: 'text-[9px] leading-[12px]',
};

// Base [fontSize, lineHeight] per variant — applied via style only when the
// user picks a non-default text size, so default rendering is unchanged.
const variantSize: Record<Variant, [number, number]> = {
  largeTitle: [34, 41], title: [28, 34], title2: [22, 28], headline: [17, 22], subtitle: [17, 22],
  body: [16, 22], callout: [15, 20], bodySmall: [13, 18], footnote: [13, 18], caption: [12, 16], label: [11, 14],
  micro: [10, 13], nano: [9, 12],
};

/**
 * Mức phóng chữ TỐI ĐA (cỡ chữ của máy × cỡ chữ trong app) theo cỡ gốc: chữ càng to càng phóng ít. Không giới hạn thì
 * máy để cỡ chữ lớn là header, chip, lưới tiện ích, thanh tab vỡ hết (chữ ×2 trong khung cố định). Vẫn phóng được — chữ
 * thường tới ×1,4 — nên người cần chữ to vẫn đọc dễ hơn.
 */
export function maxTextScale(fontSize: number): number {
  if (fontSize >= 28) return 1.15;
  if (fontSize >= 20) return 1.25;
  if (fontSize >= 14) return 1.4;
  if (fontSize >= 11) return 1.3;
  return 1.15;
}

/** maxFontSizeMultiplier cho phần phóng của MÁY, sau khi đã tính cỡ chữ trong app (nhân chồng) — tổng ≤ maxTextScale. */
export function systemFontCap(fontSize: number, appScale: number): number {
  return Math.max(1, Math.round((maxTextScale(fontSize) / appScale) * 100) / 100);
}

// Cỡ chữ / dòng ghi thẳng trong className (vd "text-[9px]", "leading-[13px]").
const PX_SIZE = /(?:^|\s)text-\[(\d+(?:\.\d+)?)px\]/;
const PX_LEADING = /(?:^|\s)leading-\[(\d+(?:\.\d+)?)px\]/;
const SIZE_CLASS = /(?:^|\s)text-\[\d+(?:\.\d+)?px\]/g;
const LEADING_CLASS = /(?:^|\s)leading-\[\d+(?:\.\d+)?px\]/g;

/**
 * [fontSize, lineHeight] gốc để nhân tỉ lệ: ưu tiên cỡ ghi thẳng trong className, không thì theo variant. Ghi cỡ mà
 * không ghi dòng → lineHeight null (chiều cao dòng tự nhiên của cỡ đó, không mang dòng 22px của body).
 */
export function baseTypoSize(variant: Variant, className?: string): [number, number | null] {
  const [sz, lh] = variantSize[variant];
  const px = className?.match(PX_SIZE);
  const lead = className?.match(PX_LEADING);
  return [px ? Number(px[1]) : sz, lead ? Number(lead[1]) : px ? null : lh];
}

/**
 * Class của variant, bỏ cỡ / dòng khi className đã ghi thẳng. cn() chỉ nối chuỗi (không gộp class trùng) và NativeWind
 * xếp class theo chữ cái — "text-[16px]" của body đứng sau "text-[12px]" nên đè lên: mọi chữ ghi cỡ 10–15px trên
 * variant mặc định (huy hiệu "Hết hàng", chip danh mục…) từng hiện thành 16px, dòng 22px.
 */
export function variantClassFor(variant: Variant, className?: string): string {
  const v = variantClass[variant];
  if (className && PX_SIZE.test(className)) return v.replace(SIZE_CLASS, '').replace(LEADING_CLASS, '').trim();
  if (className && PX_LEADING.test(className)) return v.replace(LEADING_CLASS, '').trim();
  return v;
}

const toneClass: Record<Tone, string> = {
  default: 'text-ink dark:text-ink-dark',
  muted: 'text-muted',
  faint: 'text-faint',
  primary: 'text-primary',
  error: 'text-error',
  success: 'text-success',
  warning: 'text-warning-text',
  inverse: 'text-white',
};

/** Màu chữ ghi thẳng trong className ("text-primary", "text-white/80", "text-[#…]") — không phải cỡ (text-[16px], text-sm) hay
 *  căn lề (text-center). Biến thể dark: ("dark:text-…") không tính. */
const COLOR_CLASS = /(?:^|\s)text-(?:\[#|(?!(?:xs|sm|base|lg|[2-9]?xl|left|right|center|justify|start|end)(?:\s|$|\/))[a-z])/;

/**
 * Lớp màu theo tone. tone mặc định mang "text-ink dark:text-ink-dark": nếu className đã tự ghi màu (vd "text-primary" trên
 * nút trắng) thì ở chế độ tối dark:text-ink-dark (trắng) đè lên → chữ trắng trên nền trắng, mất chữ. Có màu riêng thì
 * bỏ màu mặc định.
 */
export function toneClassFor(tone: Tone, className?: string): string {
  if (tone === 'default' && className && COLOR_CLASS.test(className)) return '';
  return toneClass[tone];
}

export type TextProps = RNTextProps & {
  className?: string;
  variant?: Variant;
  tone?: Tone;
  bold?: boolean;
};

// Cỡ chữ trong app ≠ "vừa" → nhân tỉ lệ qua style. Trước đây luôn lấy cỡ của variant (body 16/22)
// nên chữ ghi thẳng text-[9px] (huy hiệu, chip) bị đè thành 14–20px; giờ nhân đúng cỡ đã ghi.
function useTypoStyle(variant: Variant, className?: string) {
  const { family, scale } = useFontSettings();
  const fam = resolveFontFamily(family);
  const [sz, lh] = baseTypoSize(variant, className);
  const sized = scale !== 1 ? { fontSize: Math.round(sz * scale), ...(lh != null ? { lineHeight: Math.round(lh * scale) } : null) } : null;
  return [fam ? { fontFamily: fam } : null, sized, systemFontCap(sz, scale)] as const;
}

export function Text({ className, variant = 'body', tone = 'default', bold, style, ...props }: TextProps) {
  const typo = useTypoStyle(variant, className);
  return (
    <RNText
      maxFontSizeMultiplier={typo[2]}
      className={cn(variantClassFor(variant, className), toneClassFor(tone, className), bold && 'font-bold', className)}
      style={[typo[0], typo[1], style]}
      {...props}
    />
  );
}

export function Heading({ className, tone = 'default', style, ...props }: Omit<TextProps, 'variant'>) {
  const typo = useTypoStyle('largeTitle', className);
  return (
    <RNText
      maxFontSizeMultiplier={typo[2]}
      className={cn(variantClassFor('largeTitle', className), toneClassFor(tone, className), className)}
      style={[typo[0], typo[1], style]}
      {...props}
    />
  );
}
