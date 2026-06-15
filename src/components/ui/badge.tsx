import { View } from 'react-native';
import { Text } from './text';
import { Icon, type IconName } from './icon';
import { cn } from './utils';
import { brand, colors } from 'src/theme';

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'secondary';

// [container bg, text color, icon hex]
const toneMap: Record<Tone, { box: string; text: string; icon: string }> = {
  primary:   { box: 'bg-primary-50 dark:bg-[rgba(200,77,113,0.18)]',   text: 'text-primary',      icon: brand.primary },
  success:   { box: 'bg-success-soft dark:bg-[rgba(52,199,89,0.18)]',  text: 'text-success',      icon: brand.success },
  warning:   { box: 'bg-warning-soft dark:bg-[rgba(255,159,10,0.18)]', text: 'text-warning-text', icon: colors.warning.text },
  error:     { box: 'bg-error-soft dark:bg-[rgba(255,59,48,0.18)]',    text: 'text-error',        icon: brand.error },
  info:      { box: 'bg-info-soft dark:bg-[rgba(10,132,255,0.18)]',    text: 'text-info',         icon: brand.info },
  neutral:   { box: 'bg-ink/5 dark:bg-white/10',                       text: 'text-muted',        icon: brand.muted },
  secondary: { box: 'bg-secondary-soft dark:bg-[rgba(10,132,255,0.18)]', text: 'text-secondary',  icon: brand.secondary },
};

export type BadgeProps = {
  children: React.ReactNode;
  tone?: Tone;
  icon?: IconName;
  className?: string;
};

/** Small status pill. */
export function Badge({ children, tone = 'neutral', icon, className }: BadgeProps) {
  const t = toneMap[tone];
  return (
    <View className={cn('flex-row items-center gap-1 self-start rounded-full px-2.5 py-1', t.box, className)}>
      {icon ? <Icon name={icon} size={12} color={t.icon} /> : null}
      <Text className={cn('text-[11px] font-bold', t.text)}>{children}</Text>
    </View>
  );
}
