import { View } from 'react-native';
import { Text } from '../ui/text';
import { Icon, type IconName } from '../ui/icon';
import { Button } from '../ui/button';

export type EmptyStateProps = {
  icon?: IconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
};

export function EmptyState({ icon = 'inbox-outline', title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View className="items-center justify-center py-12 px-6 gap-3">
      <View className="w-16 h-16 rounded-full bg-bg dark:bg-surface-dark items-center justify-center">
        <Icon name={icon} size={30} tone="faint" />
      </View>
      <Text variant="subtitle" className="text-center">{title}</Text>
      {description ? <Text tone="muted" className="text-center">{description}</Text> : null}
      {actionLabel && onAction ? (
        <Button variant="outline" size="sm" fullWidth={false} onPress={onAction} className="mt-1">
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
