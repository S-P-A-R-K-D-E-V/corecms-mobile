// Single source of truth for design tokens — Apple HIG (iOS 18) inspired,
// with CiCi brand accent (#C84D71). Consumed by tailwind.config.js (CommonJS)
// AND app code via src/theme/index.ts. Keep CommonJS so Tailwind can require() it.

/** Brand + Apple-system semantic palette (hex / rgba). */
const colors = {
  // ── Brand accent (CiCi rose) — used like Apple's tint color ──
  primary: {
    DEFAULT: '#C84D71',
    50: '#FBEAF0',   // soft tint bg (light)
    100: '#F6D2DF',
    200: '#EBA9BE',
    400: '#D86A88',
    600: '#C84D71',
    700: '#AC3C5D',  // pressed
    900: '#7E2A43',
    dark: '#E97AA0', // lighter rose for dark-mode contrast
  },

  // Secondary accent (Apple blue) — links / informational actions
  secondary: { DEFAULT: '#0A84FF', soft: '#E7F1FF', 'soft-dark': 'rgba(10,132,255,0.15)' },

  // ── Apple semantic system colors ──
  success: { DEFAULT: '#34C759', soft: '#E4F8EA', 'soft-dark': 'rgba(52,199,89,0.15)' },
  warning: { DEFAULT: '#FF9F0A', soft: '#FFF3E0', text: '#B26A00', 'soft-dark': 'rgba(255,159,10,0.15)' },
  error: { DEFAULT: '#FF3B30', soft: '#FFE9E7', 'soft-dark': 'rgba(255,59,48,0.15)' },
  info: { DEFAULT: '#0A84FF', soft: '#E7F1FF', 'soft-dark': 'rgba(10,132,255,0.15)' },

  // ── Neutrals (Apple systemGray scale — work in both schemes) ──
  ink: '#1C1C1E',     // label (light primary text)
  muted: '#8E8E93',   // secondaryLabel (works light + dark)
  faint: '#C2C2C7',   // tertiaryLabel / disabled
  line: '#D9D9DE',    // separator (light)
  bg: '#F2F2F7',      // systemGroupedBackground (light)
  surface: '#FFFFFF', // elevated surface (light)

  // Dark scheme (deep, not pure black)
  'bg-dark': '#0A0A0B',
  'surface-dark': '#1C1C1E',
  'ink-dark': '#F5F5F7',
  'line-dark': '#38383A',

  // Hero / splash deep tone (not pure black)
  navy: { DEFAULT: '#17131A', 600: '#241A22', 800: '#0F0B12' },

  // Translucent glass fills (faux-glass surfaces)
  glass: {
    light: 'rgba(255,255,255,0.72)',
    'light-strong': 'rgba(255,255,255,0.85)',
    dark: 'rgba(28,28,30,0.62)',
    'dark-strong': 'rgba(28,28,30,0.82)',
    border: 'rgba(255,255,255,0.5)',
    'border-dark': 'rgba(255,255,255,0.12)',
  },
};

const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  card: 20,
  xl: 24,
  '2xl': 28,
  full: 999,
};

const spacing = { screen: 16 };

/** Soft Apple-style elevation (single token, used everywhere). */
const shadow = {
  color: '#000000',
  opacity: 0.08,
  radius: 24,
  offsetY: 8,
};

/** expo-blur intensities per surface. */
const blur = {
  tab: 40,
  header: 28,
  sheet: 30,
  card: 18,
};

module.exports = { colors, radius, spacing, shadow, blur };
