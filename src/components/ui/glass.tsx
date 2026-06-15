import { View, type ViewProps, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useColorScheme } from 'nativewind';
import { cn } from './utils';
import { blur as blurLevels } from 'src/theme';

export type GlassViewProps = ViewProps & {
  className?: string;
  /** Blur strength (expo-blur intensity 0–100). Defaults to card level. */
  intensity?: number;
  /** Force a tint; otherwise follows the color scheme. */
  tint?: 'light' | 'dark' | 'default';
  /** Rounded corners must be on this wrapper for the blur to clip. */
  children?: React.ReactNode;
};

/**
 * Real glassmorphism surface (expo-blur). Use sparingly — tab bar, headers,
 * sheets. The blur sits behind a faint translucent fill + hairline border so
 * content stays legible. For lightweight "faux glass" use Card instead.
 */
export function GlassView({ className, intensity, tint, children, style, ...props }: GlassViewProps) {
  const { colorScheme } = useColorScheme();
  const resolvedTint = tint ?? (colorScheme === 'dark' ? 'dark' : 'light');
  return (
    <View className={cn('overflow-hidden', className)} style={style} {...props}>
      <BlurView
        intensity={intensity ?? blurLevels.card}
        tint={resolvedTint}
        // Android needs an explicit blur backend for a real frosted effect.
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {/* Translucent fill + hairline tint to lift the glass off the content. */}
      <View
        className={cn(
          'absolute inset-0',
          resolvedTint === 'dark' ? 'bg-glass-dark' : 'bg-glass-light'
        )}
      />
      {children}
    </View>
  );
}
