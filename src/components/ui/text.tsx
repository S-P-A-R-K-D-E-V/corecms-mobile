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

// Chip/nhãn chữ siêu nhỏ nằm trong khung gần như cố định — giới hạn phóng chữ iOS (Dynamic Type)
// để không tràn/xén; chữ thường vẫn phóng theo máy như cũ.
const TINY_MAX_FONT_MULTIPLIER = 1.3;

// Cỡ chữ / dòng ghi thẳng trong className (vd "text-[9px]", "leading-[13px]").
const PX_SIZE = /(?:^|\s)text-\[(\d+(?:\.\d+)?)px\]/;
const PX_LEADING = /(?:^|\s)leading-\[(\d+(?:\.\d+)?)px\]/;

/** [fontSize, lineHeight] gốc để nhân tỉ lệ: ưu tiên cỡ ghi thẳng trong className, không thì theo variant. */
export function baseTypoSize(variant: Variant, className?: string): [number, number] {
  const [sz, lh] = variantSize[variant];
  const px = className?.match(PX_SIZE);
  const lead = className?.match(PX_LEADING);
  return [px ? Number(px[1]) : sz, lead ? Number(lead[1]) : lh];
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
  const sized = scale !== 1 ? { fontSize: Math.round(sz * scale), lineHeight: Math.round(lh * scale) } : null;
  return [fam ? { fontFamily: fam } : null, sized] as const;
}

export function Text({ className, variant = 'body', tone = 'default', bold, style, ...props }: TextProps) {
  const typo = useTypoStyle(variant, className);
  const tiny = variant === 'micro' || variant === 'nano';
  return (
    <RNText
      maxFontSizeMultiplier={tiny ? TINY_MAX_FONT_MULTIPLIER : undefined}
      className={cn(variantClass[variant], toneClass[tone], bold && 'font-bold', className)}
      style={[typo[0], typo[1], style]}
      {...props}
    />
  );
}

export function Heading({ className, tone = 'default', style, ...props }: Omit<TextProps, 'variant'>) {
  const typo = useTypoStyle('largeTitle', className);
  return (
    <RNText
      className={cn(variantClass.largeTitle, toneClass[tone], className)}
      style={[typo[0], typo[1], style]}
      {...props}
    />
  );
}
