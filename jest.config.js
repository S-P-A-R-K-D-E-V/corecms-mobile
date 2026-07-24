/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  // The app uses non-relative `src/...` imports (TS `baseUrl: "."`). Mirror
  // that resolution for Jest so test files can import modules the same way
  // the app does.
  modulePaths: ['<rootDir>'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testPathIgnorePatterns: ['/node_modules/', '/_legacy/'],
  // jest-expo's default transformIgnorePatterns doesn't cover `moti` (ships
  // untranspiled ESM) which src/components/ui pulls in transitively.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|moti))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
};
