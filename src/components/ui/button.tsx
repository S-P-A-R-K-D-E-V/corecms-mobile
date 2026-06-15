import { View } from 'react-native';
import { Text } from './text';
import { Spinner } from './spinner';
import { Icon, type IconName } from './icon';
import { PressableScale } from './pressable-scale';
import { cn } from './utils';
import { brand, softShadow } from 'src/theme';

type Variant = 'solid' | 'outline' | 'ghost';
type Action = 'primary' | 'error' | 'neutral';
type Size = 'sm' | 'md' | 'lg';

const sizeClass: Record<Size, string> = {
  sm: 'h-9 px-3.5 rounded-[12px]',
  md: 'h-12 px-4 rounded-[14px]',
  lg: 'h-[50px] px-5 rounded-[16px]',
};
const sizeText: Record<Size, string> = { sm: 'text-[14px]', md: 'text-[15px]', lg: 'text-[17px]' };

function styles(variant: Variant, action: Action): { box: string; label: string; icon: string; shadow: boolean } {
  if (variant === 'solid') {
    const bg: Record<Action, string> = { primary: 'bg-primary', error: 'bg-error', neutral: 'bg-ink dark:bg-surface-dark' };
    return { box: bg[action], label: 'text-white', icon: '#FFFFFF', shadow: action === 'primary' };
  }
  if (variant === 'outline') {
    // Apple "secondary": soft translucent fill + hairline, tinted by action.
    const ring: Record<Action, string> = { primary: 'border-primary/30', error: 'border-error/30', neutral: 'border-line dark:border-line-dark' };
    const fill: Record<Action, string> = { primary: 'bg-primary/10', error: 'bg-error/10', neutral: 'bg-ink/5 dark:bg-white/5' };
    const fg: Record<Action, string> = { primary: 'text-primary', error: 'text-error', neutral: 'text-ink dark:text-ink-dark' };
    const iconHex: Record<Action, string> = { primary: brand.primary, error: brand.error, neutral: brand.ink };
    return { box: cn('border', ring[action], fill[action]), label: fg[action], icon: iconHex[action], shadow: false };
  }
  // ghost
  const fg: Record<Action, string> = { primary: 'text-primary', error: 'text-error', neutral: 'text-muted' };
  const iconHex: Record<Action, string> = { primary: brand.primary, error: brand.error, neutral: brand.muted };
  return { box: 'bg-transparent', label: fg[action], icon: iconHex[action], shadow: false };
}

export type ButtonProps = {
  children: React.ReactNode;
  variant?: Variant;
  action?: Action;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  className?: string;
  fullWidth?: boolean;
  onPress?: () => void;
};

export function Button({
  children,
  variant = 'solid',
  action = 'primary',
  size = 'md',
  loading,
  disabled,
  icon,
  className,
  fullWidth = true,
  onPress,
}: ButtonProps) {
  const s = styles(variant, action);
  const isDisabled = disabled || loading;
  return (
    <PressableScale onPress={onPress} disabled={isDisabled} style={fullWidth ? { width: '100%' } : undefined}>
      <View
        className={cn(
          'flex-row items-center justify-center gap-2',
          sizeClass[size],
          s.box,
          fullWidth && 'w-full',
          isDisabled && 'opacity-40',
          className
        )}
        style={s.shadow && !isDisabled ? softShadow : undefined}
      >
        {loading ? (
          <Spinner color={variant === 'solid' ? '#FFFFFF' : s.icon} />
        ) : icon ? (
          // Icon present: icon anchored left, text truly centered, right spacer balances.
          <>
            <Icon name={icon} size={18} color={s.icon} />
            {typeof children === 'string' ? (
              <Text className={cn('flex-1 text-center font-semibold', sizeText[size], s.label)}>{children}</Text>
            ) : (
              <View style={{ flex: 1, alignItems: 'center' }}>{children}</View>
            )}
            <View style={{ width: 18 }} />
          </>
        ) : (
          typeof children === 'string' ? (
            <Text className={cn('font-semibold', sizeText[size], s.label)}>{children}</Text>
          ) : (
            children
          )
        )}
      </View>
    </PressableScale>
  );
}
