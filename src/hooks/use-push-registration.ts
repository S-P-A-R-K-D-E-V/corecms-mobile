import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

import { useAuthContext } from 'src/auth/auth-context';
import { registerPushToken, unregisterPushToken } from 'src/api/notifications';

// ----------------------------------------------------------------------

const PUSH_TOKEN_KEY = 'expoPushToken';

async function getExpoPushToken(): Promise<string | null> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenData.data;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------

export function usePushRegistration() {
  const { user } = useAuthContext();

  useEffect(() => {
    if (!user) return;

    // Android requires a notification channel
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Thông báo chung',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00A76F',
      });
      Notifications.setNotificationChannelAsync('shift', {
        name: 'Ca làm việc',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 80, 40, 80],
        lightColor: '#00B8D9',
      });
      Notifications.setNotificationChannelAsync('attendance', {
        name: 'Chấm công',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#00A76F',
      });
      Notifications.setNotificationChannelAsync('payroll', {
        name: 'Bảng lương',
        importance: Notifications.AndroidImportance.DEFAULT,
        lightColor: '#22C55E',
      });
    }

    (async () => {
      const token = await getExpoPushToken();
      if (!token) return;

      // Persist locally so we can unregister on logout
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);

      try {
        await registerPushToken(token, Platform.OS);
      } catch {
        // silently fail — token will be re-registered on next app start
      }
    })();
  }, [user?.id]);   // re-run when user changes (login)
}

export async function unregisterCurrentPushToken(): Promise<void> {
  try {
    const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
    if (!token) return;
    await unregisterPushToken(token);
    await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
  } catch {}
}
