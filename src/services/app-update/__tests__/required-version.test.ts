jest.mock('expo-updates', () => ({ runtimeVersion: null }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: { appVariant: 'store' } } } }));

import { compareVersions, isUpdateRequired, MIN_STORE_APP_VERSION } from '../required-version';

// Chủ 2026-10-21: đóng bản 1.0.2 + 1.0.3, ép nâng lên 1.0.4.

describe('compareVersions', () => {
  it('compares number by number, not as text', () => {
    expect(compareVersions('1.0.10', '1.0.4')).toBeGreaterThan(0);
    expect(compareVersions('1.0.3', '1.0.4')).toBeLessThan(0);
    expect(compareVersions('1.0.4', '1.0.4')).toBe(0);
    expect(compareVersions('1.1', '1.0.9')).toBeGreaterThan(0);
  });
});

describe('isUpdateRequired', () => {
  it('blocks store builds older than the minimum', () => {
    expect(MIN_STORE_APP_VERSION).toBe('1.0.4');
    expect(isUpdateRequired('1.0.2', true, false)).toBe(true);
    expect(isUpdateRequired('1.0.3', true, false)).toBe(true);
  });

  it('lets the current and newer store builds through', () => {
    expect(isUpdateRequired('1.0.4', true, false)).toBe(false);
    expect(isUpdateRequired('1.0.5', true, false)).toBe(false);
  });

  it('never blocks the CiCi app, dev builds or an unknown version', () => {
    expect(isUpdateRequired('1.0.2', false, false)).toBe(false);
    expect(isUpdateRequired('1.0.2', true, true)).toBe(false);
    expect(isUpdateRequired(null, true, false)).toBe(false);
  });
});
