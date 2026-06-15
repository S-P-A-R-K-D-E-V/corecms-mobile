import { createContext, useContext, useEffect, useState } from 'react';
import { logger } from '../logger';

// ----------------------------------------------------------------------
// Remote config / feature flags. Ships with static defaults and (optionally)
// refreshes from the backend at boot. Always falls back to defaults so the app
// works offline / before the first fetch resolves.
// ----------------------------------------------------------------------

export type FeatureFlags = {
  requireFaceVerification: boolean;
  geofenceEnabled: boolean;
  chatEnabled: boolean;
  payrollEnabled: boolean;
  shiftSwapEnabled: boolean;
  shiftPoolEnabled: boolean;
  onboardingEnabled: boolean;
};

export const defaultFlags: FeatureFlags = {
  requireFaceVerification: true,
  geofenceEnabled: true,
  chatEnabled: true,
  payrollEnabled: true,
  shiftSwapEnabled: true,
  shiftPoolEnabled: true,
  onboardingEnabled: true,
};

const log = logger;

/** Stub remote fetch — replace with a real endpoint when the backend exposes one. */
async function fetchRemoteFlags(): Promise<Partial<FeatureFlags>> {
  // Example future impl:
  //   const { data } = await axiosInstance.get('/config/mobile-flags');
  //   return data;
  return {};
}

const RemoteConfigContext = createContext<FeatureFlags>(defaultFlags);

export function RemoteConfigProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags);

  useEffect(() => {
    let active = true;
    fetchRemoteFlags()
      .then((remote) => {
        if (active && remote && Object.keys(remote).length) {
          setFlags((prev) => ({ ...prev, ...remote }));
        }
      })
      .catch((e) => log.warn('remote-config fetch failed', e));
    return () => {
      active = false;
    };
  }, []);

  return <RemoteConfigContext.Provider value={flags}>{children}</RemoteConfigContext.Provider>;
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(RemoteConfigContext);
}

export function useFeatureFlag<K extends keyof FeatureFlags>(key: K): FeatureFlags[K] {
  return useContext(RemoteConfigContext)[key];
}
