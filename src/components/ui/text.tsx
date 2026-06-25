import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from './utils';
import { useFontSettings, resolveFontFamily } from 'src/theme/FontProvider';

// Apple type ramp. Existing names (title/subtitle/body/bodySmall/caption/label)
// kept for backward-compat; new names (largeTitle/title2/headline/callout/footnote).
type Variant =
  | 'largeTitle' | 'title' | 'title2' | 'headline' | 'subtitle'
  | 'body' | 'callout' | 'bodySmall' | 'footnote' | 'caption' | 'label';

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
};

// Base [fontSize, lineHeight] per variant — applied via style only when the
// user picks a non-default text size, so default rendering is unchanged.
const variantSize: Record<Variant, [number, number]> = {
  largeTitle: [34, 41], title: [28, 34], title2: [22, 28], headline: [17, 22], subtitle: [17, 22],
  body: [16, 22], callout: [15, 20], bodySmall: [13, 18], footnote: [13, 18], caption: [12, 16], label: [11, 14],
};

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

function useTypoStyle(variant: Variant) {
  const { family, scale } = useFontSettings();
  const fam = resolveFontFamily(family);
  const [sz, lh] = variantSize[variant];
  const sized = scale !== 1 ? { fontSize: Math.round(sz * scale), lineHeight: Math.round(lh * scale) } : null;
  return [fam ? { fontFamily: fam } : null, sized] as const;
}

export function Text({ className, variant = 'body', tone = 'default', bold, style, ...props }: TextProps) {
  const typo = useTypoStyle(variant);
  return (
    <RNText
      className={cn(variantClass[variant], toneClass[tone], bold && 'font-bold', className)}
      style={[typo[0], typo[1], style]}
      {...props}
    />
  );
}

export function Heading({ className, tone = 'default', style, ...props }: Omit<TextProps, 'variant'>) {
  const typo = useTypoStyle('largeTitle');
  return (
    <RNText
      className={cn(variantClass.largeTitle, toneClass[tone], className)}
      style={[typo[0], typo[1], style]}
      {...props}
    />
  );
}
