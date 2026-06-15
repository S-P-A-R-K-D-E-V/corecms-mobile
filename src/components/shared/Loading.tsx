import { View } from 'react-native';
import { Spinner } from '../ui/spinner';
import { Text } from '../ui/text';

export function Loading({ label }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center py-12 gap-3">
      <Spinner size="large" />
      {label ? <Text tone="muted">{label}</Text> : null}
    </View>
  );
}
