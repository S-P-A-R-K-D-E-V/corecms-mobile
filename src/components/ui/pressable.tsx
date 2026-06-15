import { Pressable as RNPressable, type PressableProps } from 'react-native';
import { cn } from './utils';

export type { PressableProps };

/** Pressable with sensible default press feedback. */
export function Pressable({ className, ...props }: PressableProps & { className?: string }) {
  return <RNPressable className={cn('active:opacity-70', className)} {...props} />;
}
