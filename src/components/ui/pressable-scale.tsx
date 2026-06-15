import { useMemo } from 'react';
import { MotiPressable } from 'moti/interactions';
import type { ViewStyle } from 'react-native';
import { spring, pressScale } from 'src/theme/motion';

export type PressableScaleProps = {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** Scale target while pressed (default 0.96). */
  scaleTo?: number;
  style?: ViewStyle;
  children: React.ReactNode;
};

/**
 * Pressable that scales down on press with a natural spring (Apple-style).
 * Style the visual box on the child (className) — this wrapper only animates.
 */
export function PressableScale({ onPress, onLongPress, disabled, scaleTo = pressScale, style, children }: PressableScaleProps) {
  const animate = useMemo(
    () =>
      ({ pressed }: { pressed: boolean }) => {
        'worklet';
        return { scale: pressed ? scaleTo : 1, opacity: pressed ? 0.92 : 1 };
      },
    [scaleTo]
  );
  return (
    <MotiPressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      animate={animate}
      transition={{ type: 'spring', ...spring.soft }}
      style={style}
    >
      {children}
    </MotiPressable>
  );
}
