import { View, type ViewProps } from 'react-native';
import { cn } from './utils';

export type BoxProps = ViewProps & { className?: string };

/** Plain layout primitive (a styled View). */
export function Box({ className, ...props }: BoxProps) {
  return <View className={className} {...props} />;
}

/** Vertical stack. Use `space-y-*` or gap via className for spacing. */
export function VStack({ className, ...props }: BoxProps) {
  return <View className={cn('flex-col', className)} {...props} />;
}

/** Horizontal stack. */
export function HStack({ className, ...props }: BoxProps) {
  return <View className={cn('flex-row items-center', className)} {...props} />;
}

/** Pushes siblings apart inside an HStack/VStack. */
export function Spacer({ className, ...props }: BoxProps) {
  return <View className={cn('flex-1', className)} {...props} />;
}
