import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Brand colors matching core-fe (Material Design 3)
const palette = {
  primary: '#00A76F',
  primaryDark: '#007867',
  secondary: '#8E33FF',
  error: '#FF5630',
  warning: '#FFAB00',
  info: '#00B8D9',
  success: '#22C55E',
  background: '#F4F6F8',
  backgroundDark: '#161C24',
  surface: '#FFFFFF',
  surfaceDark: '#212B36',
  text: '#1C252E',
  textSecondary: '#637381',
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    secondary: palette.secondary,
    error: palette.error,
    background: palette.background,
    surface: palette.surface,
    onSurface: palette.text,
    outline: '#E0E0E0',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: palette.primary,
    secondary: palette.secondary,
    error: palette.error,
    background: palette.backgroundDark,
    surface: palette.surfaceDark,
    onSurface: '#F4F6F8',
  },
};

export { palette };
