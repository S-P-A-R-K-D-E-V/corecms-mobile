import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';

import { useAuthContext } from 'src/auth/auth-context';
import { HOST_API } from 'src/api/axios';
import type { INotification } from 'src/api/notifications';

// ----------------------------------------------------------------------

export function useNotificationHub(options?: {
  onNewNotification?: (n: INotification) => void;
}) {
  const { user } = useAuthContext();
  const connRef = useRef<signalR.HubConnection | null>(null);
  const callbackRef = useRef(options?.onNewNotification);
  callbackRef.current = options?.onNewNotification;

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
