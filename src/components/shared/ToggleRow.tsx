import { View, Switch, Platform } from 'react-native';
import { Text } from '../ui/text';
import { Icon, type IconName } from '../ui/icon';
import { brand } from 'src/theme';
import { cn } from '../ui/utils';

export type ToggleRowProps = {
  icon?: IconName;
  iconColor?: string;
  title: string;
  description?: string;
  value: boolean;
  onToggle: (v: boolean) => void;
  disabled?: boolean;
};

export function ToggleRow({ icon, iconColor = brand.primary, title, description, value, onToggle, disabled }: ToggleRowProps) {
  return (
    <View className={cn('flex-row items-center gap-3 py-3', disabled && 'opacity-50')}>
      {icon ? (
        <View className="w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: `${iconColor}1A` }}>
          <Icon name={icon} size={22} color={iconColor} />
        </View>
      ) : null}
      <View className="flex-1">
        <Text variant="body" className="font-semibold">{title}</Text>
        {description ? <Text variant="caption" tone="muted" className="mt-0.5">{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: brand.line, true: `${iconColor}60` }}
        thumbColor={value ? iconColor : '#BDBDBD'}
        style={Platform.OS === 'ios' ? { transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] } : undefined}
      />
    </View>
  );
}
