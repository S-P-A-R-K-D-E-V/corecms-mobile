import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { getBranchLocations } from 'src/api/attendance';
import { evaluateGeofence, type GeofenceFailReason, type NearestBranch } from 'src/services/geo';
import type { IBranchLocation } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// GPS gate — đồng bộ hành vi check-in: tự lấy vị trí khi mở màn, hiện trạng
// thái, nếu lỗi/từ chối thì đếm ngược rồi cho phép truy cập (fallback mềm).
// Có thể bật `requireGeofence` để bắt buộc đang Ở TRONG khu vực cửa hàng — khi đó
// không tải được danh sách chi nhánh thì CHẶN (fail closed), không cho qua.
// Dùng cho các tính năng cần xác nhận có mặt tại quầy (vd. Kiểm tiền quầy).
// ----------------------------------------------------------------------

export type Coords = { latitude: number; longitude: number; accuracy?: number };
export type GpsStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Lý do chưa cho qua: chưa cấp quyền / không lấy được vị trí (GPS tắt) / vị trí giả lập / lỗi geofence. */
export type GpsBlockReason = 'permission' | 'unavailable' | 'mocked' | GeofenceFailReason;

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
  /** Chi nhánh gần nhất + khoảng cách (khi bật geofence và chi nhánh có toạ độ). */
  nearest: NearestBranch | null;
  /** Đang ở trong khu vực cửa hàng (chỉ ý nghĩa khi requireGeofence). */
  within: boolean;
  /** Lý do đang chặn — null khi đang lấy vị trí hoặc đã qua. */
  reason: GpsBlockReason | null;
  retry: () => Promise<Coords | null>;
  /** Lấy lại vị trí ngầm (vd app quay lại foreground) — KHÔNG hiện màn "đang xác định", chỉ chặn
   *  khi kết quả mới rõ ràng không đạt (ra ngoài cửa hàng / vị trí giả / bị thu hồi quyền).
   *  Đang bị chặn vì quyền / GPS tắt mà giờ quyền đã cấp (vừa bật trong Cài đặt) → lấy lại từ đầu. */
  revalidate: () => Promise<void>;
};

const FALLBACK_SECONDS = 5;

export type UseGpsGateOptions = {
  fallbackSeconds?: number;
  /** Chặn cứng: bắt buộc có GPS mới cho vào, không có fallback đếm ngược. */
  hardBlock?: boolean;
  /** Bắt buộc đang trong bán kính geofence của một chi nhánh. */
  requireGeofence?: boolean;
  /** Sai số GPS tối đa (mét) khi xét geofence — BE check-in/kiểm quầy dùng 200. */
  maxAccuracy?: number;
  /** Chặn vị trí giả lập (cờ `mocked` của Android). */
  rejectMocked?: boolean;
  /** false = chưa lấy vị trí (vd chờ bước kiểm tra trước đó); bật lên thì tự lấy. Mặc định true. */
  enabled?: boolean;
};

export function useGpsGate({
  fallbackSeconds = FALLBACK_SECONDS,
  hardBlock = false,
  requireGeofence = false,
  maxAccuracy,
  rejectMocked = false,
  enabled = true,
}: UseGpsGateOptions = {}): GpsGate {
  const [status, setStatus] = useState<GpsStatus>('idle');
  const [errorReason, setErrorReason] = useState<'permission' | 'unavailable' | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [mocked, setMocked] = useState(false);
  // null = chưa tải hoặc tải lỗi (khi bật geofence → chặn).
  const [branches, setBranches] = useState<IBranchLocation[] | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [fallback, setFallback] = useState(false);

  const readPosition = useCallback(async () => {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const c: Coords = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy ?? undefined,
    };
    return { c, mocked: loc.mocked === true };
  }, []);

  const fetchGps = useCallback(async (): Promise<Coords | null> => {
    setStatus('loading');
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setErrorReason('permission');
        setStatus('error');
        return null;
      }
      const pos = await readPosition();
      setCoords(pos.c);
      setMocked(pos.mocked);
      // Tải chi nhánh để biết có trong khu vực cửa hàng không. Lỗi → để null (bị chặn, có nút thử lại).
      if (requireGeofence) {
        try {
          setBranches(await getBranchLocations());
        } catch {
          setBranches(null);
        }
      }
      setErrorReason(null);
      setStatus('ready');
      return pos.c;
    } catch {
      setErrorReason('unavailable');
      setStatus('error');
      return null;
    }
  }, [requireGeofence, readPosition]);

  const revalidate = useCallback(async () => {
    // Đang chặn vì chưa cấp quyền / không lấy được vị trí: người dùng có thể vừa vào Cài đặt bật lên rồi
    // quay lại → lấy lại từ đầu. Chỉ khi quyền ĐÃ cấp — không tự bật hộp thoại xin quyền (Android: hộp
    // thoại đưa app ra nền rồi vào lại → hỏi lặp mãi); vẫn từ chối thì giữ màn chặn, chờ bấm thử lại.
    if (status === 'error') {
      try {
        const { status: perm } = await Location.getForegroundPermissionsAsync();
        if (perm === 'granted') await fetchGps();
      } catch {
        // Không đọc được quyền → giữ màn chặn.
      }
      return;
    }
    if (status !== 'ready') return;
    try {
      const { status: perm } = await Location.getForegroundPermissionsAsync();
      if (perm !== 'granted') {
        setErrorReason('permission');
        setStatus('error');
        return;
      }
      const pos = await readPosition();
      // Sai số lớn (vừa mở lại trong nhà) không phải bằng chứng đã rời cửa hàng → giữ toạ độ cũ.
      if (maxAccuracy != null && pos.c.accuracy != null && pos.c.accuracy > maxAccuracy) return;
      setCoords(pos.c);
      setMocked(pos.mocked);
    } catch {
      // Lấy vị trí ngầm lỗi → giữ toạ độ đã xác minh, không khoá màn đang thao tác.
    }
  }, [status, readPosition, maxAccuracy, fetchGps]);

  // Tự lấy GPS khi mở màn (hoặc khi vừa được bật).
  const started = useRef(false);
  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    fetchGps();
  }, [enabled, fetchGps]);

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

  // Geofence: chi nhánh đang hoạt động có toạ độ → phải ở trong bán kính của một chi nhánh. Không chi
  // nhánh nào có toạ độ → không chặn theo geofence (đồng bộ BE, tránh khoá cứng khi chưa cấu hình).
  const geofence =
    requireGeofence && status === 'ready' && coords ? evaluateGeofence(coords, branches, { maxAccuracy }) : null;

  const reason: GpsBlockReason | null =
    status === 'error'
      ? errorReason ?? 'unavailable'
      : status !== 'ready'
        ? null
        : rejectMocked && mocked
          ? 'mocked'
          : geofence && !geofence.ok
            ? geofence.reason
            : null;

  const within = geofence ? geofence.ok : true;
  const passed = status === 'ready' && reason === null;

  return {
    status,
    coords,
    countdown: hardBlock ? null : countdown,
    fallback: hardBlock ? false : fallback,
    // Fallback mềm chỉ áp dụng khi KHÔNG lấy được GPS; đã có vị trí mà sai geofence thì vẫn chặn.
    allowed: passed || (!hardBlock && fallback && status !== 'ready'),
    hardBlock,
    requireGeofence,
    nearest: geofence?.nearest ?? null,
    within,
    reason,
    retry: fetchGps,
    revalidate,
  };
}
