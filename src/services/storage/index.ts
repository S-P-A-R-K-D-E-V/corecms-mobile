import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ----------------------------------------------------------------------
// Centralised storage wrapper.
//   secure.*  → sensitive tokens (Keychain/Keystore via SecureStore)
//   prefs.*   → non-sensitive app preferences (AsyncStorage)
// Key strings are kept stable for backwards-compat with existing sessions.
// ----------------------------------------------------------------------

export const SecureKeys = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  sessionToken: 'sessionToken',
} as const;

export const PrefKeys = {
  onboardingDone: 'pref.onboardingDone',
  colorScheme: 'pref.colorScheme', // 'light' | 'dark' | 'system'
  language: 'pref.language',
  fontFamily: 'pref.fontFamily', // 'system' | 'publicSans'
  fontScale: 'pref.fontScale',   // 'small' | 'medium' | 'large' | 'xlarge'
  launcherPins: 'pref.launcherPins', // JSON: { staff: string[], admin: string[] }
} as const;

export const secure = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  remove: (key: string) => SecureStore.deleteItemAsync(key),
};

export const prefs = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  remove: (key: string) => AsyncStorage.removeItem(key),
  async getBool(key: string, fallback = false) {
    const v = await AsyncStorage.getItem(key);
    return v == null ? fallback : v === 'true';
  },
  setBool: (key: string, value: boolean) => AsyncStorage.setItem(key, String(value)),
};
