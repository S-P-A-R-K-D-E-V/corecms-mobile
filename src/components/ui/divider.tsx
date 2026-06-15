import { View } from 'react-native';
import { cn } from './utils';

export function Divider({ className }: { className?: string }) {
  return <View className={cn('h-px bg-line dark:bg-line-dark', className)} />;
}
