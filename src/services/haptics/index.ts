// Lightweight haptic feedback built on the core Vibration API (zero native
// deps — keeps the patched Android build safe). Semantic wrappers so call
// sites read like expo-haptics; swap the impl for `expo-haptics` later by
// editing only this file.
import { Vibration, Platform } from 'react-native';

function buzz(pattern: number | number[]) {
  try {
    Vibration.vibrate(pattern as any);
  } catch {
    /* no-op on unsupported devices/simulators */
  }
}

export const haptics = {
  /** Subtle tick — toggles, selection, tab change. */
  selection: () => buzz(8),
  /** Light tap — button press. */
  light: () => buzz(10),
  /** Medium tap — sheet open, primary action. */
  medium: () => buzz(18),
  /** Heavy tap — destructive confirm. */
  heavy: () => buzz(32),
  /** Success cadence — check-in/checkout/finalize done. */
  success: () => buzz(Platform.OS === 'android' ? [0, 24, 48, 24] : [0, 35]),
  /** Warning cadence. */
  warning: () => buzz([0, 20, 40, 20]),
  /** Error cadence. */
  error: () => buzz([0, 38, 50, 38]),
};
