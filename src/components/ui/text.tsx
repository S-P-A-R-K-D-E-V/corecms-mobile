import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { cn } from './utils';

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

export function Text({ className, variant = 'body', tone = 'default', bold, ...props }: TextProps) {
  return (
    <RNText
      className={cn(variantClass[variant], toneClass[tone], bold && 'font-bold', className)}
      {...props}
    />
  );
}

export function Heading({ className, tone = 'default', ...props }: Omit<TextProps, 'variant'>) {
  return <RNText className={cn(variantClass.largeTitle, toneClass[tone], className)} {...props} />;
}
