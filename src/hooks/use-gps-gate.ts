import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { getBranchLocations } from 'src/api/attendance';
import { findNearestBranch, type NearestBranch } from 'src/services/geo';

// ----------------------------------------------------------------------
// GPS gate — đồng bộ hành vi check-in: tự lấy vị trí khi mở màn, hiện trạng
// thái, nếu lỗi/từ chối thì đếm ngược rồi cho phép truy cập (fallback mềm).
// Có thể bật `requireGeofence` để bắt buộc đang Ở TRONG khu vực cửa hàng.
// Dùng cho các tính năng cần xác nhận có mặt tại quầy (vd. Kiểm tiền quầy).
// ----------------------------------------------------------------------

export type Coords = { latitude: number; longitude: number; accuracy?: number };
export type GpsStatus = 'idle' | 'loading' | 'ready' | 'error';

export type GpsGate = {
  status: GpsStatus;
  coords: Coords | null;
  countdown: number | null;
  fallback: boolean;
  /** Được phép vào tính năng. */
  allowed: boolean;
  hardBlock: boolean;
  /** Có bật kiểm tra geofence không. */
  requireGeofence: boolean;
  /** Chi nhánh gần nhất + khoảng cách + có trong khu vực không (khi bật geofence). */
  nearest: NearestBranch | null;
  /** Đang ở trong khu vực cửa hàng (chỉ ý nghĩa khi requireGeofence). */
  within: boolean;
  retry: () => Promise<Coords | null>;
};

const FALLBACK_SECONDS = 5;

export type UseGpsGateOptions = {
  fallbackSeconds?: number;
  /** Chặn cứng: bắt buộc có GPS mới cho vào, không có fallback đếm ngược. */
  hardBlock?: boolean;
  /** Bắt buộc đang trong bán kính geofence của một chi nhánh. */
  requireGeofence?: boolean;
};

export function useGpsGate({
  fallbackSeconds = FALLBACK_SECONDS,
  hardBlock = false,
  requireGeofence = false,
}: UseGpsGateOptions = {}): GpsGate {
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [coords, setCoords] = useState<Coords | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);
  const [nearest, setNearest] = useState<NearestBranch | null>(null);

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
      // Tính chi nhánh gần nhất để biết có trong khu vực cửa hàng không.
      if (requireGeofence) {
        try {
          const branches = await getBranchLocations();
          setNearest(findNearestBranch(c, branches));
        } catch {
          setNearest(null);
        }
      }
      setStatus('ready');
      return c;
    } catch {
      setStatus('error');
      return null;
    }
  }, [requireGeofence]);

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

  // Khi bật geofence, chỉ coi là "trong khu vực" nếu nearest.within = true.
  // Nếu không có dữ liệu toạ độ chi nhánh (nearest null) → không chặn theo geofence
  // (tránh khoá cứng khi BE chưa cấu hình toạ độ cửa hàng).
  const within = !requireGeofence || nearest == null ? true : nearest.within;

  const baseAllowed = status === 'ready' || (!hardBlock && fallback);

  return {
    status,
    coords,
    countdown: hardBlock ? null : countdown,
    fallback: hardBlock ? false : fallback,
    allowed: baseAllowed && within,
    hardBlock,
    requireGeofence,
    nearest,
    within,
    retry: fetchGps,
  };
}
