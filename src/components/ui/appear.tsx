import { MotiView } from 'moti';
import type { ViewStyle } from 'react-native';
import { duration, staggerStep } from 'src/theme/motion';

export type AppearProps = {
  children: React.ReactNode;
  /** Stagger index — multiplies the per-item delay. */
  index?: number;
  /** Override base delay (ms). */
  delay?: number;
  /** Vertical rise distance (px). */
  rise?: number;
  style?: ViewStyle;
};

/** Fade + rise entrance (Apple-calm). Pass `index` for list stagger. */
export function Appear({ children, index = 0, delay, rise = 14, style }: AppearProps) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: rise }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: duration.normal, delay: delay ?? index * staggerStep }}
      style={style}
    >
      {children}
    </MotiView>
  );
}
