import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

// ----------------------------------------------------------------------

const STORAGE_KEY = 'notification_preferences';

export interface NotificationPreferences {
  globalEnabled: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  categories: {
    Shift: boolean;
    Attendance: boolean;
    Payroll: boolean;
    Leave: boolean;
    System: boolean;
  };
}

const DEFAULT_PREFS: NotificationPreferences = {
  globalEnabled: true,
  vibrationEnabled: true,
  soundEnabled: true,
  categories: {
    Shift: true,
    Attendance: true,
    Payroll: true,
    Leave: true,
    System: true,
  },
};

// ----------------------------------------------------------------------

export function useNotificationSettings() {
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');

  useEffect(() => {
    (async () => {
      try {
        const stored = await SecureStore.getItemAsync(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<NotificationPreferences>;
          setPrefs({
            ...DEFAULT_PREFS,
            ...parsed,
            categories: { ...DEFAULT_PREFS.categories, ...(parsed.categories ?? {}) },
          });
        }
      } catch {}

      try {
        const { status } = await Notifications.getPermissionsAsync();
        setPermissionStatus(status);
      } catch {}

      setLoaded(true);
    })();
  }, []);

  const save = useCallback(async (next: NotificationPreferences) => {
    setPrefs(next);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const updatePrefs = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      const next: NotificationPreferences = {
        ...prefs,
        ...updates,
        categories: { ...prefs.categories, ...((updates.categories as object) ?? {}) },
      };
      await save(next);
    },
    [prefs, save]
  );

  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status: existing } = await Notifications.getPermissionsAsync();
      if (existing === 'granted') {
        setPermissionStatus('granted');
        return true;
      }
      const { status } = await Notifications.requestPermissionsAsync();
      setPermissionStatus(status);
      return status === 'granted';
    } catch {
      return false;
    }
  }, []);

  const isCategoryEnabled = useCallback(
    (category: string): boolean => {
      if (!prefs.globalEnabled) return false;
      return prefs.categories[category as keyof typeof prefs.categories] ?? true;
    },
    [prefs]
  );

  return { prefs, loaded, permissionStatus, updatePrefs, requestPermission, isCategoryEnabled };
}
