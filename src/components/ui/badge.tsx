import { View } from 'react-native';
import { Text } from './text';
import { Icon, type IconName } from './icon';
import { cn } from './utils';
import { brand, colors } from 'src/theme';

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'secondary';
type Variant = 'soft' | 'filled';

// Minimal "Label": soft = alpha(main, 0.16) fill + tinted text (default);
// filled = solid main + contrast text.
const SOFT: Record<Tone, { box: string; text: string; icon: string }> = {
  primary:   { box: 'bg-primary-soft',   text: 'text-primary',      icon: brand.primary },
  success:   { box: 'bg-success-soft',   text: 'text-success',      icon: brand.success },
  warning:   { box: 'bg-warning-soft',   text: 'text-warning-text', icon: colors.warning.text },
  error:     { box: 'bg-error-soft',     text: 'text-error',        icon: brand.error },
  info:      { box: 'bg-info-soft',      text: 'text-info',         icon: brand.info },
  secondary: { box: 'bg-secondary-soft', text: 'text-secondary',    icon: brand.secondary },
  neutral:   { box: 'bg-ink/10 dark:bg-white/10', text: 'text-muted', icon: brand.muted },
};

const FILLED: Record<Tone, { box: string; text: string; icon: string }> = {
  primary:   { box: 'bg-primary',   text: 'text-white', icon: '#FFFFFF' },
  success:   { box: 'bg-success',   text: 'text-white', icon: '#FFFFFF' },
  warning:   { box: 'bg-warning',   text: 'text-ink',   icon: brand.ink },
  error:     { box: 'bg-error',     text: 'text-white', icon: '#FFFFFF' },
  info:      { box: 'bg-info',      text: 'text-white', icon: '#FFFFFF' },
  secondary: { box: 'bg-secondary', text: 'text-white', icon: '#FFFFFF' },
  neutral:   { box: 'bg-ink dark:bg-white/20', text: 'text-white', icon: '#FFFFFF' },
};

export type BadgeProps = {
  children: React.ReactNode;
  tone?: Tone;
  variant?: Variant;
  icon?: IconName;
  className?: string;
};

/** Small status label (Minimal "Label"). Rounded-rect, soft by default. */
export function Badge({ children, tone = 'neutral', variant = 'soft', icon, className }: BadgeProps) {
  const t = (variant === 'filled' ? FILLED : SOFT)[tone];
  return (
    <View className={cn('flex-row items-center gap-1 self-start rounded-md px-2 py-0.5', t.box, className)}>
      {icon ? <Icon name={icon} size={12} color={t.icon} /> : null}
      <Text className={cn('text-[12px] font-bold', t.text)}>{children}</Text>
    </View>
  );
}
