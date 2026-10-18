import { useCallback, useEffect, useRef, useState } from 'react';
import * as signalR from '@microsoft/signalr';

import { getHostApi } from 'src/api/axios';
import { currentAccessToken } from 'src/api/session';

import type { FaceTrack, VerifyResult } from './face-stream';

// ----------------------------------------------------------------------
// Kết nối SignalR /hubs/self-verify cho màn quét khuôn mặt khi chấm công — cùng hub với "tự kiểm tra khuôn mặt" trên
// web: máy chủ chỉ chuyển khung hình sang face-tracking-service, trả vị trí khuôn mặt ("tracks") và kết quả so 1:1 với
// chính người đang đăng nhập ("verify_result"); KHÔNG ghi chấm công. Chỉ mở khi màn quét đang mở.
// ----------------------------------------------------------------------

export type FaceStreamState = 'connecting' | 'connected' | 'failed';

function parseTracks(raw: unknown): FaceTrack[] {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray((parsed as any)?.tracks) ? (parsed as any).tracks : [];
  } catch {
    return [];
  }
}

function parseError(raw: unknown): string {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)?.message ?? raw;
    } catch {
      return raw;
    }
  }
  if (raw && typeof raw === 'object' && 'message' in raw) return String((raw as any).message ?? '');
  return 'Lỗi nhận diện khuôn mặt';
}

/** @param session Đổi số này để mở kết nối mới (Thử lại) — máy chủ chỉ so mỗi khuôn mặt một lần / kết nối. */
export function useFaceStream(active: boolean, session = 0) {
  const connRef = useRef<signalR.HubConnection | null>(null);
  const seqRef = useRef(0);
  const [state, setState] = useState<FaceStreamState>('connecting');
  const [tracks, setTracks] = useState<FaceTrack[]>([]);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;
    setState('connecting');
    setTracks([]);
    setVerifyResult(null);
    setError(null);
    seqRef.current = 0;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${getHostApi()}/hubs/self-verify`, {
        accessTokenFactory: currentAccessToken,
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect([0, 1000, 3000])
      .configureLogging(signalR.LogLevel.None)
      .build();

    conn.on('tracks', (raw: unknown) => setTracks(parseTracks(raw)));
    conn.on('verify_result', (payload: VerifyResult) => setVerifyResult(payload));
    conn.on('error', (raw: unknown) => setError(parseError(raw)));
    conn.onreconnecting(() => setState('connecting'));
    conn.onreconnected(() => setState('connected'));
    conn.onclose(() => {
      if (!stopped) setState('failed');
    });

    conn
      .start()
      .then(() => {
        if (stopped) return;
        connRef.current = conn;
        setState('connected');
      })
      .catch(() => {
        if (!stopped) setState('failed');
      });

    return () => {
      stopped = true;
      connRef.current = null;
      conn.stop().catch(() => {});
    };
  }, [active, session]);

  const sendFrame = useCallback((base64: string) => {
    const conn = connRef.current;
    if (conn?.state !== signalR.HubConnectionState.Connected) return false;
    seqRef.current += 1;
    conn.invoke('Frame', seqRef.current, base64).catch(() => {});
    return true;
  }, []);

  /** Bỏ kết quả so cũ (vd sau khi máy chủ chấm công từ chối) để chờ lần nhận diện mới. */
  const resetVerify = useCallback(() => setVerifyResult(null), []);

  return { state, tracks, verifyResult, error, sendFrame, resetVerify };
}
