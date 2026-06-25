import { View } from 'react-native';
import { Text } from '../ui/text';
import { Pressable } from '../ui/pressable';
import { Icon, type IconName } from '../ui/icon';
import { Badge } from '../ui/badge';
import { cn } from '../ui/utils';

type IconTone = NonNullable<React.ComponentProps<typeof Icon>['tone']>;

// Soft tinted icon containers per tone — gives settings/menu rows colour.
const tintBg: Partial<Record<IconTone, string>> = {
  primary: 'bg-primary-50 dark:bg-[rgba(200,77,113,0.18)]',
  secondary: 'bg-secondary-soft dark:bg-[rgba(10,132,255,0.18)]',
  info: 'bg-info-soft dark:bg-[rgba(10,132,255,0.18)]',
  success: 'bg-success-soft dark:bg-[rgba(52,199,89,0.18)]',
  warning: 'bg-warning-soft dark:bg-[rgba(255,159,10,0.18)]',
  error: 'bg-error-soft dark:bg-[rgba(255,59,48,0.18)]',
};

export type ListItemProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  iconTone?: React.ComponentProps<typeof Icon>['tone'];
  right?: React.ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  disabled?: boolean;
  className?: string;
};

/** Generic settings/menu row. */
export function ListItem({
  title,
  subtitle,
  icon,
  iconTone = 'muted',
  right,
  onPress,
  showChevron,
  disabled,
  className,
}: ListItemProps) {
  const Body = (
    <View className={cn('flex-row items-center gap-3 py-3', disabled && 'opacity-40', className)}>
      {icon ? (
        <View className={cn('w-9 h-9 rounded-full items-center justify-center', tintBg[iconTone] ?? 'bg-bg dark:bg-surface-dark')}>
          <Icon name={icon} size={18} tone={iconTone} />
        </View>
      ) : null}
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text variant="body" className="font-medium">{title}</Text>
          {disabled ? <Badge tone="neutral">Sắp có</Badge> : null}
        </View>
        {subtitle ? <Text variant="bodySmall" tone="muted">{subtitle}</Text> : null}
      </View>
      {right}
      {showChevron && !disabled ? <Icon name="chevron-right" size={20} tone="faint" /> : null}
    </View>
  );
  return (onPress && !disabled) ? <Pressable onPress={onPress}>{Body}</Pressable> : Body;
}
