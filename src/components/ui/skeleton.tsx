import { MotiView } from 'moti';
import type { DimensionValue, ViewStyle } from 'react-native';
import { useColorScheme } from 'nativewind';

export type SkeletonProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

/** Calm shimmer placeholder (slow opacity pulse). */
export function Skeleton({ width = '100%', height = 16, radius = 8, style }: SkeletonProps) {
  const { colorScheme } = useColorScheme();
  const bg = colorScheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(60,60,67,0.09)';
  return (
    <MotiView
      from={{ opacity: 0.4 }}
      animate={{ opacity: 0.85 }}
      transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 1000 }}
      style={[{ width, height, borderRadius: radius, backgroundColor: bg }, style]}
    />
  );
}
