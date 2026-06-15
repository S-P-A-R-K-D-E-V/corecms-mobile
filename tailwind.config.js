const { colors, radius } = require('./src/theme/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors,
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        card: `${radius.card}px`,
        xl: `${radius.xl}px`,
        '2xl': `${radius['2xl']}px`,
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
