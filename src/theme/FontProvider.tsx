import { createContext, useContext, useEffect, useState } from 'react';
import { prefs, PrefKeys } from 'src/services/storage';

// User-configurable typography. Default font is **System** (renders bold
// correctly on every platform); Public Sans is opt-in. Size is a global scale
// applied to the DS Text variants.

export type FontFamilyPref = 'system' | 'publicSans';
export type FontScaleKey = 'small' | 'medium' | 'large' | 'xlarge';

export const FONT_SCALES: Record<FontScaleKey, number> = {
  small: 0.9,
  medium: 1,
  large: 1.12,
  xlarge: 1.25,
};

/** Resolve a family pref to an actual RN font family (undefined = system). */
export function resolveFontFamily(family: FontFamilyPref): string | undefined {
  return family === 'publicSans' ? 'PublicSans' : undefined;
}

type FontContextValue = {
  family: FontFamilyPref;
  scaleKey: FontScaleKey;
  scale: number;
  setFamily: (f: FontFamilyPref) => void;
  setScaleKey: (k: FontScaleKey) => void;
};

const FontContext = createContext<FontContextValue>({
  family: 'system',
  scaleKey: 'medium',
  scale: 1,
  setFamily: () => {},
  setScaleKey: () => {},
});

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [family, setFamilyState] = useState<FontFamilyPref>('system');
  const [scaleKey, setScaleKeyState] = useState<FontScaleKey>('medium');

  useEffect(() => {
    prefs.get(PrefKeys.fontFamily).then((v) => {
      if (v === 'publicSans' || v === 'system') setFamilyState(v);
    });
    prefs.get(PrefKeys.fontScale).then((v) => {
      if (v && v in FONT_SCALES) setScaleKeyState(v as FontScaleKey);
    });
  }, []);

  const setFamily = (f: FontFamilyPref) => {
    setFamilyState(f);
    void prefs.set(PrefKeys.fontFamily, f);
  };
  const setScaleKey = (k: FontScaleKey) => {
    setScaleKeyState(k);
    void prefs.set(PrefKeys.fontScale, k);
  };

  return (
    <FontContext.Provider value={{ family, scaleKey, scale: FONT_SCALES[scaleKey], setFamily, setScaleKey }}>
      {children}
    </FontContext.Provider>
  );
}

export function useFontSettings() {
  return useContext(FontContext);
}
