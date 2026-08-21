import { useEffect, useRef, useState, useCallback } from 'react';
import * as signalR from '@microsoft/signalr';
import * as SecureStore from 'expo-secure-store';

import { HOST_API } from 'src/api/axios';

// ----------------------------------------------------------------------
// Live camera "tự kiểm tra khuôn mặt" — mirror use-notification-hub.ts (JWT qua SecureStore,
// transport WebSockets + skipNegotiation — bắt buộc trên React Native, xem messenger-provider.tsx)
// nối tới /hubs/self-verify (core-be, xem SelfVerifyHub) thay vì luồng quay video 3s cũ.

export type TrackState = 'NEW' | 'TRACKING' | 'QUALITY_OK' | 'LIVENESS_PASSED' | 'LIVENESS_FAILED' | 'EMBEDDED';

export type ITrack = {
  trackId: string;
  bbox: [number, number, number, number];
  confidence: number;
  quality?: number | null;
  state: TrackState;
};

type ITracksMessage = { type: 'tracks'; seq: number; tracks: ITrack[] };

export type IVerifyResult = { trackId: string; matched: boolean; similarity: number };

export type SelfVerifyConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

function parseTracksMessage(raw: string): ITrack[] {
  try {
    const parsed = JSON.parse(raw) as ITracksMessage;
    return Array.isArray(parsed?.tracks) ? parsed.tracks : [];
  } catch {
    return [];
  }
}

function parseErrorMessage(raw: unknown): string {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed?.message ?? raw;
    } catch {
      return raw;
    }
  }
  if (raw && typeof raw === 'object' && 'message' in raw) {
    return String((raw as { message?: unknown }).message ?? 'Lỗi không xác định');
  }
  return 'Lỗi không xác định';
}

/** @param active Chỉ mở kết nối khi true (modal đang hiện) — đóng hẳn khi tắt modal. */
export function useSelfVerifyHub(active: boolean) {
  const connRef = useRef<signalR.HubConnection | null>(null);
  const seqRef = useRef(0);

  const [connectionState, setConnectionState] = useState<SelfVerifyConnectionState>('connecting');
  const [tracks, setTracks] = useState<ITrack[]>([]);
  const [verifyResult, setVerifyResult] = useState<IVerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    if (!active) return undefined;

    setConnectionState('connecting');
    setTracks([]);
    setVerifyResult(null);
    setError(null);
    seqRef.current = 0;

    let mounted = true;

    (async () => {
      const token = await SecureStore.getItemAsync('accessToken');

      const conn = new signalR.HubConnectionBuilder()
        .withUrl(`${HOST_API}/hubs/self-verify`, {
          accessTokenFactory: () => token ?? '',
          transport: signalR.HttpTransportType.WebSockets,
          skipNegotiation: true,
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      conn.on('tracks', (raw: string) => setTracks(parseTracksMessage(raw)));
      conn.on('verify_result', (payload: IVerifyResult) => setVerifyResult(payload));
      conn.on('error', (raw: unknown) => setError(parseErrorMessage(raw)));

      conn.onreconnecting(() => setConnectionState('reconnecting'));
      conn.onreconnected(() => setConnectionState('connected'));
      conn.onclose(() => setConnectionState('disconnected'));

      if (!mounted) return;
      connRef.current = conn;
      try {
        await conn.start();
        if (mounted) setConnectionState('connected');
      } catch (err: any) {
        if (mounted) {
          setConnectionState('disconnected');
          setError(String(err?.message ?? err ?? 'Không kết nối được máy chủ'));
        }
      }
    })();

    return () => {
      mounted = false;
      connRef.current?.stop().catch(() => {});
      connRef.current = null;
    };
  }, [active]);

  const sendFrame = useCallback((base64Data: string) => {
    const conn = connRef.current;
    if (conn?.state !== signalR.HubConnectionState.Connected) return;
    seqRef.current += 1;
    conn.invoke('Frame', seqRef.current, base64Data).catch(() => {});
  }, []);

  return { connectionState, tracks, verifyResult, error, clearError, sendFrame };
}
