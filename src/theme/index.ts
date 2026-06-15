// Typed accessor over the shared JS tokens (single source: ./tokens.js).
// Use this in code that needs raw hex values (StatusBar, navigation tab colors,
// icon `color` props) — everything else should use NativeWind className strings.
import tokens from './tokens';

export const { colors, radius, spacing, shadow, blur } = tokens as {
  colors: Record<string, any>;
  radius: Record<string, number>;
  spacing: Record<string, number>;
  shadow: { color: string; opacity: number; radius: number; offsetY: number };
  blur: { tab: number; header: number; sheet: number; card: number };
};

/** Apple-soft elevation as a React Native style object. */
export const softShadow = {
  shadowColor: shadow.color,
  shadowOpacity: shadow.opacity,
  shadowRadius: shadow.radius,
  shadowOffset: { width: 0, height: shadow.offsetY },
  elevation: 4,
};

/** Flattened brand hex values for imperative use. */
export const brand = {
  primary: colors.primary.DEFAULT as string,
  primaryDark: colors.primary[700] as string,
  navy: colors.navy.DEFAULT as string,
  secondary: colors.secondary.DEFAULT as string,
  error: colors.error.DEFAULT as string,
  warning: colors.warning.DEFAULT as string,
  info: colors.info.DEFAULT as string,
  success: colors.success.DEFAULT as string,
  ink: colors.ink as string,
  muted: colors.muted as string,
  faint: colors.faint as string,
  line: colors.line as string,
  bg: colors.bg as string,
  surface: colors.surface as string,
  bgDark: colors['bg-dark'] as string,
  surfaceDark: colors['surface-dark'] as string,
  inkDark: colors['ink-dark'] as string,
  lineDark: colors['line-dark'] as string,
};

export default tokens;
