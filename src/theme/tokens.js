// Single source of truth for design tokens — aligned to the **Minimal**
// (minimals.cc) design system that core-fe uses, with the CiCi brand **rose**
// kept as `primary` (Minimal's default green is intentionally replaced).
// Consumed by tailwind.config.js (CommonJS) AND app code via src/theme/index.ts.

// ── Minimal grey scale ──────────────────────────────────────────────────────
const grey = {
  0: '#FFFFFF',
  100: '#F9FAFB',
  200: '#F4F6F8',
  300: '#DFE3E8',
  400: '#C4CDD5',
  500: '#919EAB',
  600: '#637381',
  700: '#454F5B',
  800: '#212B36',
  900: '#161C24',
};

/** Brand + Minimal semantic palette. `*-soft` = alpha(main, 0.16) (Minimal's
 *  soft fill — readable on both light & dark surfaces). */
const colors = {
  grey,

  // ── Brand accent (CiCi rose) — kept as the Minimal `primary` slot ──
  primary: {
    DEFAULT: '#C84D71',
    50: '#FBEAF0',
    100: '#F6D2DF',
    200: '#EBA9BE',
    400: '#D86A88',
    600: '#C84D71',
    700: '#AC3C5D',
    900: '#7E2A43',
    dark: '#E97AA0', // lighter rose for dark-mode contrast
    // Minimal-shaped aliases
    lighter: '#F6D2DF',
    light: '#E892AD',
    main: '#C84D71',
    darker: '#7E2A43',
    soft: 'rgba(200,77,113,0.16)',
    'soft-dark': 'rgba(200,77,113,0.22)',
  },

  // ── Minimal semantic system colors ──
  secondary: { DEFAULT: '#8E33FF', light: '#C684FF', dark: '#5119B7', soft: 'rgba(142,51,255,0.16)', 'soft-dark': 'rgba(142,51,255,0.22)' },
  info:      { DEFAULT: '#00B8D9', light: '#61F3F3', dark: '#006C9C', soft: 'rgba(0,184,217,0.16)', 'soft-dark': 'rgba(0,184,217,0.22)' },
  success:   { DEFAULT: '#22C55E', light: '#77ED8B', dark: '#118D57', soft: 'rgba(34,197,94,0.16)', 'soft-dark': 'rgba(34,197,94,0.22)' },
  warning:   { DEFAULT: '#FFAB00', light: '#FFD666', dark: '#B76E00', text: '#B76E00', soft: 'rgba(255,171,0,0.16)', 'soft-dark': 'rgba(255,171,0,0.22)' },
  error:     { DEFAULT: '#FF5630', light: '#FFAC82', dark: '#B71D18', soft: 'rgba(255,86,48,0.16)', 'soft-dark': 'rgba(255,86,48,0.22)' },

  // ── Neutrals (mapped to the Minimal grey scale) ──
  ink: grey[800],     // text.primary
  muted: grey[600],   // text.secondary
  faint: grey[500],   // text.disabled
  line: 'rgba(145,158,171,0.20)', // divider = alpha(grey500, 0.2)
  bg: grey[200],      // background.neutral
  surface: '#FFFFFF', // background.paper

  // Dark scheme (Minimal dark: default grey900, paper grey800)
  'bg-dark': grey[900],
  'surface-dark': grey[800],
  'ink-dark': '#FFFFFF',
  'line-dark': 'rgba(145,158,171,0.24)',

  // Hero / splash deep tone (not pure black)
  navy: { DEFAULT: '#17131A', 600: '#241A22', 800: '#0F0B12' },

  // Translucent glass fills (faux-glass surfaces) — dark uses Minimal grey800
  glass: {
    light: 'rgba(255,255,255,0.72)',
    'light-strong': 'rgba(255,255,255,0.85)',
    dark: 'rgba(33,43,54,0.62)',
    'dark-strong': 'rgba(33,43,54,0.82)',
    border: 'rgba(255,255,255,0.5)',
    'border-dark': 'rgba(255,255,255,0.12)',
  },
};

// Minimal shape: base radius 8, cards 16.
const radius = {
  sm: 8,
  md: 10,
  lg: 12,
  card: 16,
  xl: 16,
  '2xl': 20,
  full: 999,
};

const spacing = { screen: 16 };

/** Minimal "card" elevation — soft, **grey-tinted** (not black). Approximates
 *  `0 0 2px alpha(grey500,.2), 0 12px 24px -4px alpha(grey500,.12)`. */
const shadow = {
  color: '#919EAB', // grey[500]
  opacity: 0.16,
  radius: 24,
  offsetY: 12,
};

/** expo-blur intensities per surface. */
const blur = {
  tab: 40,
  header: 28,
  sheet: 30,
  card: 18,
};

module.exports = { colors, grey, radius, spacing, shadow, blur };
