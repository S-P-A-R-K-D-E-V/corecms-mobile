// Global test setup. jest-expo's preset already wires up the RN/Expo native
// module mocks; this file is for anything app-specific tests commonly need.

// `src/services/storage` (pulled in transitively by src/components/ui via
// src/theme/FontProvider) reads AsyncStorage at import time, which has no
// native implementation under Jest — use the package's official mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Official mock — SafeAreaProvider/useSafeAreaInsets() need a real native
// layout measurement under a real device; under Jest that never happens,
// which otherwise throws "No safe area value available" from any screen
// using src/components/shared/Screen.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default
);
