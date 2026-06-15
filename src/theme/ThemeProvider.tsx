import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { colorScheme as nwColorScheme } from 'nativewind';
import { prefs, PrefKeys } from 'src/services/storage';

export type ThemePreference = 'light' | 'dark' | 'system';

type ThemeContextValue = {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  preference: 'system',
  setPreference: () => {},
});

function apply(pref: ThemePreference) {
  // NativeWind (darkMode: 'class') — 'system' lets it follow the device.
  nwColorScheme.set(pref);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    prefs.get(PrefKeys.colorScheme).then((v) => {
      const p = (v as ThemePreference) || 'system';
      setPreferenceState(p);
      apply(p);
    });
  }, []);

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p);
    apply(p);
    void prefs.set(PrefKeys.colorScheme, p);
  };

  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>{children}</ThemeContext.Provider>
  );
}

export function useThemePreference() {
  return useContext(ThemeContext);
}
