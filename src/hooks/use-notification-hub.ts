import { useEffect, useRef } from 'react';
import { Vibration } from 'react-native';
import * as signalR from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';

import { useAuthContext } from 'src/auth/auth-context';
import { HOST_API } from 'src/api/axios';
import type { INotification } from 'src/api/notifications';
import type { NotificationPreferences } from './use-notification-settings';

// ----------------------------------------------------------------------

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

// ----------------------------------------------------------------------

export function useNotificationHub(options?: {
  onNewNotification?: (n: INotification) => void;
  preferences?: NotificationPreferences;
}) {
  const { user } = useAuthContext();
  const connRef = useRef<signalR.HubConnection | null>(null);
  const callbackRef = useRef(options?.onNewNotification);
  const prefsRef = useRef(options?.preferences);

  callbackRef.current = options?.onNewNotification;
  prefsRef.current = options?.preferences;

  useEffect(() => {
    if (!user) return;

    let mounted = true;

    (async () => {
      const token = await SecureStore.getItemAsync('accessToken');

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(`${HOST_API}/hubs/notifications`, {
          accessTokenFactory: () => token ?? '',
          transport: signalR.HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      conn.on('NewNotification', (notification: INotification) => {
        const prefs = prefsRef.current;

        // Respect notification preferences if provided
        if (prefs) {
          if (!prefs.globalEnabled) return;
          const cat = (notification.category ?? notification.type) as keyof typeof prefs.categories;
          if (prefs.categories[cat] === false) return;

          if (prefs.vibrationEnabled) {
            Vibration.vibrate([0, 80, 40, 80]);
          }

          // Show OS notification (works when app is in foreground too via handler above)
          Notifications.scheduleNotificationAsync({
            content: {
              title: notification.title,
              body: notification.body,
              sound: prefs.soundEnabled ? 'default' : undefined,
              data: { id: notification.id, type: notification.type },
            },
            trigger: null,
          }).catch(() => {});
        }

        callbackRef.current?.(notification);
      });

      if (!mounted) return;
      connRef.current = conn;
      try { await conn.start(); } catch {}
    })();

    return () => {
      mounted = false;
      connRef.current?.stop();
      connRef.current = null;
    };
  }, [user]);
}
