import { View } from 'react-native';
import { Text } from './text';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { cn } from './utils';
import { brand, colors } from 'src/theme';

type Variant = 'soft' | 'filled' | 'outlined';
type ChipColor = 'default' | 'primary' | 'secondary' | 'info' | 'success' | 'warning' | 'error';
type Size = 'sm' | 'md';

const SIZE: Record<Size, { box: string; text: string; icon: number }> = {
  sm: { box: 'h-7 px-2.5 gap-1', text: 'text-[12px]', icon: 14 },
  md: { box: 'h-8 px-3 gap-1.5', text: 'text-[13px]', icon: 16 },
};

const SOFT_BG: Record<ChipColor, string> = {
  default: 'bg-ink/10 dark:bg-white/10', primary: 'bg-primary-soft', secondary: 'bg-secondary-soft',
  info: 'bg-info-soft', success: 'bg-success-soft', warning: 'bg-warning-soft', error: 'bg-error-soft',
};
const TINT_TEXT: Record<ChipColor, string> = {
  default: 'text-ink dark:text-ink-dark', primary: 'text-primary', secondary: 'text-secondary',
  info: 'text-info', success: 'text-success', warning: 'text-warning-text', error: 'text-error',
};
const SOLID_BG: Record<ChipColor, string> = {
  default: 'bg-ink', primary: 'bg-primary', secondary: 'bg-secondary',
  info: 'bg-info', success: 'bg-success', warning: 'bg-warning', error: 'bg-error',
};
const OUTLINE: Record<ChipColor, string> = {
  default: 'border-line dark:border-line-dark', primary: 'border-primary/50', secondary: 'border-secondary/50',
  info: 'border-info/50', success: 'border-success/50', warning: 'border-warning/50', error: 'border-error/50',
};
const ICON_HEX: Record<ChipColor, string> = {
  default: brand.ink, primary: brand.primary, secondary: brand.secondary,
  info: brand.info, success: brand.success, warning: colors.warning.text, error: brand.error,
};

export type ChipProps = {
  label: string;
  color?: ChipColor;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  /** Forces the filled look (e.g. filter chips). */
  selected?: boolean;
  onPress?: () => void;
  className?: string;
};

/** Minimal "Chip" — pill, soft by default; `selected` forces the filled look. */
export function Chip({ label, color = 'default', variant = 'soft', size = 'md', icon, selected, onPress, className }: ChipProps) {
  const v: Variant = selected ? 'filled' : variant;
  const s = SIZE[size];

  let box: string;
  let text: string;
  let iconColor: string;
  if (v === 'filled') {
    box = SOLID_BG[color];
    text = color === 'warning' ? 'text-ink' : 'text-white';
    iconColor = color === 'warning' ? brand.ink : '#FFFFFF';
  } else if (v === 'outlined') {
    box = cn('border bg-transparent', OUTLINE[color]);
    text = TINT_TEXT[color];
    iconColor = ICON_HEX[color];
  } else {
    box = SOFT_BG[color];
    text = TINT_TEXT[color];
    iconColor = ICON_HEX[color];
  }

  const content = (
    <View className={cn('flex-row items-center self-start rounded-full', s.box, box, className)}>
      {icon ? <Icon name={icon} size={s.icon} color={iconColor} /> : null}
      <Text className={cn('font-semibold', s.text, text)}>{label}</Text>
    </View>
  );

  return onPress ? <PressableScale onPress={onPress}>{content}</PressableScale> : content;
}
