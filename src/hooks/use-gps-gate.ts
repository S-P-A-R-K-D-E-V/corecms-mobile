import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

// ----------------------------------------------------------------------
// GPS gate — đồng bộ hành vi check-in: tự lấy vị trí khi mở màn, hiện trạng
// thái, nếu lỗi/từ chối thì đếm ngược rồi cho phép truy cập (fallback mềm).
// Dùng cho các tính năng cần xác nhận có mặt tại quầy (vd. Kiểm tiền quầy).
// ----------------------------------------------------------------------

export type Coords = { latitude: number; longitude: number; accuracy?: number };
export type GpsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type GpsGate = {
  status: GpsStatus;
  coords: Coords | null;
  /** Số giây còn lại trước khi mở fallback (null nếu không đếm / chặn cứng). */
  countdown: number | null;
  /** Đã cho phép truy cập dù GPS lỗi (sau khi hết đếm ngược). */
  fallback: boolean;
  /** Được phép vào tính năng. Chặn mềm: có toạ độ HOẶC fallback. Chặn cứng: chỉ khi có toạ độ. */
  allowed: boolean;
  /** Đang ở chế độ chặn cứng (không fallback). */
  hardBlock: boolean;
  retry: () => Promise<Coords | null>;
};

const FALLBACK_SECONDS = 5;

export type UseGpsGateOptions = {
  fallbackSeconds?: number;
  /** Chặn cứng: bắt buộc có GPS mới cho vào, không có fallback đếm ngược. */
  hardBlock?: boolean;
};

export function useGpsGate({ fallbackSeconds = FALLBACK_SECONDS, hardBlock = false }: UseGpsGateOptions = {}): GpsGate {
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);

  const fetchGps = useCallback(async (): Promise<Coords | null> => {
    setStatus('loading');
    const { status: perm } = await Location.requestForegroundPermissionsAsync();
    if (perm !== 'granted') {
      setStatus('error');
      return null;
    }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const c: Coords = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? undefined,
      };
      setCoords(c);
      setStatus('ready');
      return c;
    } catch {
      setStatus('error');
      return null;
    }
  }, []);

  // Tự lấy GPS khi mở màn.
  useEffect(() => {
    fetchGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPS lỗi → bắt đầu đếm ngược; GPS ready → reset. Bỏ qua hoàn toàn khi chặn cứng.
  useEffect(() => {
    if (hardBlock) return;
    if (status === 'error') {
      setCountdown((c) => (c === null ? fallbackSeconds : c));
    } else if (status === 'ready') {
      setCountdown(null);
      setFallback(false);
    }
  }, [status, fallbackSeconds, hardBlock]);

  useEffect(() => {
    if (hardBlock || countdown === null) return;
    if (countdown <= 0) {
      setFallback(true);
      return;
    }
    const tmr = setTimeout(() => setCountdown((n) => (n !== null ? n - 1 : null)), 1000);
    return () => clearTimeout(tmr);
  }, [countdown, hardBlock]);

  return {
    status,
    coords,
    countdown: hardBlock ? null : countdown,
    fallback: hardBlock ? false : fallback,
    // Chặn cứng: chỉ cho vào khi thực sự có toạ độ.
    allowed: status === 'ready' || (!hardBlock && fallback),
    hardBlock,
    retry: fetchGps,
  };
}
