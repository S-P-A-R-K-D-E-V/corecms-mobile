import { useMemo } from 'react';
import { MotiPressable } from 'moti/interactions';
import type { AccessibilityRole, AccessibilityState, ViewStyle } from 'react-native';
import { spring, pressScale } from 'src/theme/motion';

export type PressableScaleProps = {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  /** Scale target while pressed (default 0.96). */
  scaleTo?: number;
  style?: ViewStyle;
  /**
   * Trợ năng: Pressable ngoài cùng mới là phần tử VoiceOver / TalkBack đọc (con bên trong bị gộp vào), nên
   * vai trò / nhãn / trạng thái phải đặt ở đây — đặt trên View con thì bị bỏ qua.
   */
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  children: React.ReactNode;
};

/**
 * Pressable that scales down on press with a natural spring (Apple-style).
 * Style the visual box on the child (className) — this wrapper only animates.
 */
export function PressableScale({
  onPress,
  onLongPress,
  disabled,
  scaleTo = pressScale,
  style,
  accessibilityRole,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  children,
}: PressableScaleProps) {
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
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
    >
      {children}
    </MotiPressable>
  );
}
