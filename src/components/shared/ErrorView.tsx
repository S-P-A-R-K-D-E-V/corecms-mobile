import { View } from 'react-native';
import { Text } from '../ui/text';
import { Icon } from '../ui/icon';
import { Button } from '../ui/button';

export type ErrorViewProps = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export function ErrorView({
  title = 'Đã có lỗi xảy ra',
  message = 'Vui lòng thử lại.',
  onRetry,
  retryLabel = 'Thử lại',
}: ErrorViewProps) {
  return (
    <View className="items-center justify-center py-12 px-6 gap-3">
      <View className="w-16 h-16 rounded-full bg-error-soft items-center justify-center">
        <Icon name="alert-circle-outline" size={30} tone="error" />
      </View>
      <Text variant="subtitle" className="text-center">{title}</Text>
      <Text tone="muted" className="text-center">{message}</Text>
      {onRetry ? (
        <Button variant="outline" action="error" size="sm" fullWidth={false} icon="refresh" onPress={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      ) : null}
    </View>
  );
}
