import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import { MotiView } from 'moti';
import { router } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import dayjs from 'dayjs';

import { Screen, SectionCard, StatCard, EmptyState, goBackOrHome } from 'src/components/shared';
import { usesAdminShell } from 'src/auth/roles';
import { Text, Button, Badge, Card, Icon, Pressable, Divider, BrandGradient, Appear, SuccessOverlay, Spinner, type IconName } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand, softShadow } from 'src/theme';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';
import { isPlatformFeatureDisabledError } from 'src/auth/platform-features';
import { useQuery } from '@tanstack/react-query';

import { smartCheckIn, smartCheckOut, checkIn, checkinFace, getBranchLocations, getAttendanceSettings } from 'src/api/attendance';
import { extractApiError } from 'src/services/error';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { t } from 'src/i18n';

import { useCheckinData } from './hooks';
import { FaceCaptureModal } from './FaceCaptureModal';
import { FaceCheckinModal } from './FaceCheckinModal';
import { LOCATION_FRESH_MS, locationFields, retryLocation, sendWithFreshLocation, withTimeout, type LocationFix } from './location';
import { locateForAttendance } from './fresh-location';
import { CleaningChecklistSummaryCard } from './CleaningChecklistSummaryCard';
import {
  getCheckInWindow,
  getActiveCheckinShift,
  getNextUpcomingShift,
  formatTime,
  formatElapsed,
  formatCountdown,
  nearestBranchDistance,
  findNearestBranch,
  reverseGeocode,
  formatDistance,
  type Coords,
  type GpsStatus,
} from './utils';
import type { IMyScheduleItem } from 'src/types/corecms-api';
import { BranchSwitcher } from 'src/features/branch/BranchSwitcher';
import { useWorkingBranch } from 'src/features/branch/working-branch';


// ── Shift row ────────────────────────────────────────────────────────────────
function ShiftRow({ shift, now }: { shift: IMyScheduleItem; now: dayjs.Dayjs }) {
  const w = getCheckInWindow(shift, now);
  const dot =
    w.status === 'allowed' || w.status === 'checked-in' ? 'bg-primary' :
    w.status === 'too-early' ? 'bg-warning' : 'bg-faint';

  const badge = {
    'too-early': { tone: 'warning' as const, label: 'Sắp tới' },
    allowed: { tone: 'success' as const, label: 'Đang mở' },
    'too-late': { tone: 'neutral' as const, label: 'Đã qua' },
    'checked-in': { tone: 'success' as const, label: 'Đã check-in' },
  }[w.status];

  const hint = (() => {
    const from = w.allowedFrom.format('HH:mm');
    const to = w.shiftEnd.format('HH:mm');
    if (w.status === 'too-early') return `Check-in từ ${from} → ${to}  (còn ${formatCountdown(w.minutesUntil)})`;
    if (w.status === 'allowed') return `✓ Có thể check-in đến ${to}`;
    if (w.status === 'checked-in') return `Check-in lúc ${shift.checkInTime ? dayjs(shift.checkInTime).format('HH:mm') : '--'}`;
    return `Khung check-in: ${from} → ${to}`;
  })();

  return (
    <View className="flex-row items-start gap-3 py-2.5">
      <View className={cn('w-2.5 h-2.5 rounded-full mt-1.5', dot)} />
      <View className="flex-1">
        <Text variant="subtitle" className="text-[15px]">{shift.shiftName}</Text>
        <Text variant="bodySmall" tone="muted">{shift.startTime} – {shift.endTime}  ·  {shift.totalHours}h</Text>
        <Text variant="caption" tone={w.status === 'allowed' ? 'primary' : 'muted'} className="mt-0.5">{hint}</Text>
      </View>
      <Badge tone={badge.tone}>{badge.label}</Badge>
    </View>
  );
}


// ── Screen ───────────────────────────────────────────────────────────────────
export function CheckinScreen() {
  const { user, refreshUser } = useAuthContext();
  const { logs, shifts, report, activeLog, refreshing, refetch } = useCheckinData();

  // Live clock (1s) for countdown + hero clock.
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tmr = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tmr);
  }, []);
  const nowD = dayjs(now);

  const activeCheckinShift = getActiveCheckinShift(shifts, nowD);
  const nextUpcomingShift = getNextUpcomingShift(shifts, nowD);
  const isCheckedIn = !!activeLog;
  const canCheckIn = !activeLog && activeCheckinShift !== null;

  // Shift progress (0–1) — recalculates each second via nowD
  const shiftProgress = useMemo(() => {
    const ws = isCheckedIn ? shifts.find((s) => s.hasCheckedIn) : null;
    if (!ws) return 0;
    const date = nowD.format('YYYY-MM-DD');
    const start = dayjs(`${date} ${ws.startTime}`);
    const end = dayjs(`${date} ${ws.endTime}`);
    const total = end.diff(start, 'minute');
    if (total <= 0) return 0;
    return Math.min(1, Math.max(0, nowD.diff(start, 'minute') / total));
  }, [isCheckedIn, shifts, nowD]);

  const disabledReason = (() => {
    if (activeLog) return null;
    if (shifts.length === 0) return t('checkin.noShiftToday');
    if (activeCheckinShift) return null;
    if (nextUpcomingShift) {
      const { allowedFrom } = getCheckInWindow(nextUpcomingShift, nowD);
      return `Check-in mở lúc ${allowedFrom.format('HH:mm')} (còn ${formatCountdown(allowedFrom.diff(nowD, 'minute'))})`;
    }
    if (shifts.every((s) => s.hasCheckedIn)) return 'Đã check-in tất cả ca hôm nay';
    return 'Ngoài khung giờ check-in';
  })();

  // GPS
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  // Quyền vị trí: null = chưa biết. canAskAgain=false (đã chặn hẳn) → chỉ còn cách mở Cài đặt của máy.
  const [gpsPerm, setGpsPerm] = useState<{ granted: boolean; canAskAgain: boolean } | null>(null);
  const [coords, setCoords] = useState<Coords | null>(null);
  /** Lúc lấy được `coords` (ms) — vị trí cũ hơn LOCATION_FRESH_MS thì bấm chấm công sẽ lấy lại. */
  const coordsAtRef = useRef(0);
  /** Đang lấy vị trí khi vừa bấm check-in / check-out (thử lại tới 5 giây). */
  const [locating, setLocating] = useState(false);
  /** Lần chấm công đang mở: thử GPS 5 giây không được → máy chủ ghi "không có GPS". */
  const [gpsUnavailable, setGpsUnavailable] = useState(false);
  /** Định vị bị chặn: chưa cho phép vị trí / định vị của máy đang tắt → không chấm công được tới khi bật. */
  const [gpsBlocked, setGpsBlocked] = useState<'permission' | 'services' | null>(null);
  // Chi nhánh (cửa hàng) để tính & hiển thị khoảng cách GPS cho người dùng
  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: getBranchLocations, staleTime: 60 * 60 * 1000 });
  // Được phân công chi nhánh (branchScope) → chỉ đo tới chi nhánh đang làm việc; chưa phân công → chi nhánh gần nhất
  // như trước.
  const workingBranchId = useWorkingBranch((s) => s.branch?.id ?? null);
  const scoped = user?.branchScope?.allBranches === false;
  const geofenceBranches =
    branchesQ.data && scoped && workingBranchId
      ? branchesQ.data.filter((b) => b.id === workingBranchId)
      : branchesQ.data;
  const branchDistanceM = coords && geofenceBranches ? nearestBranchDistance(coords, geofenceBranches) : null;
  const nearestBranch = coords && geofenceBranches ? findNearestBranch(coords, geofenceBranches) : null;

  // Địa chỉ cụ thể (reverse-geocode như core-fe) để in vào ảnh check-in.
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (!coords) { setAddress(null); return; }
    let cancelled = false;
    reverseGeocode(coords).then((a) => { if (!cancelled) setAddress(a); });
    return () => { cancelled = true; };
  }, [coords?.latitude, coords?.longitude]);
  const overlayAddress =
    [nearestBranch?.within ? nearestBranch.branch.branchName : null, address].filter(Boolean).join(' · ') || null;

  // Ngoài khu vực cửa hàng (đã có vị trí, cửa hàng đặt toạ độ chi nhánh) → check-in thường bị máy chủ từ chối, chuyển
  // sang check-in ngoài giờ sau 5 giây. GPS lỗi thì KHÔNG chuyển: bấm check-in sẽ thử lại GPS 5 giây rồi vẫn cho chấm
  // công thường, máy chủ đánh dấu lần đó không có vị trí.
  const outsideStore = gpsStatus === 'ready' && !!nearestBranch && !nearestBranch.within;

  // Check-in thường (có ca) hay ngoài giờ (không có ca, đang ở cửa hàng).
  const [checkinMode, setCheckinMode] = useState<'smart' | 'overtime'>('smart');
  // Modal chụp ảnh dùng chung cho cả check-in và check-out (backend đã bắt buộc ảnh
  // checkout cho người làm hộ 1 phần — LateArrive/EarlyLeave/MidShift — mobile trước
  // đây chỉ bắt ảnh lúc check-in nên chặn mất người hộ ca không có ảnh để gửi lên).
  const [actionKind, setActionKind] = useState<'checkin' | 'checkout'>('checkin');
  const hasFaceEmbedding = !!user?.hasFaceEmbedding;
  // Mỗi lúc cửa hàng chỉ dùng MỘT luồng (thiết lập "Chấm công bằng khuôn mặt" của quản lý), áp cho mọi người như nhau:
  //   bật → chỉ quét khuôn mặt (chưa đăng ký khuôn mặt thì phải đăng ký trước);
  //   tắt → chỉ chụp ảnh gửi nhóm chấm công, kể cả người đã đăng ký khuôn mặt.
  // Máy chủ chặn luồng còn lại (Attendance.FaceRequired / FaceCheckinDisabled) — gặp lỗi đó thì nạp lại thiết lập.
  const settingsQ = useQuery({ queryKey: ['attendance-settings'], queryFn: getAttendanceSettings, staleTime: 30 * 1000 });
  const faceMode = !!settingsQ.data?.requireFaceVerification;
  /** Chế độ khuôn mặt mà chưa đăng ký khuôn mặt → các nút dẫn sang đăng ký. */
  const needsEnroll = faceMode && !hasFaceEmbedding;

  /**
   * Luồng cửa hàng đang dùng, chắc chắn trước khi mở camera: true = khuôn mặt, false = chụp ảnh; thiết lập chưa tải được
   * thì tải lại, vẫn lỗi → null (báo lỗi, không mở gì).
   */
  async function currentFaceMode(): Promise<boolean | null> {
    const data = settingsQ.data ?? (await settingsQ.refetch()).data;
    if (data) return data.requireFaceVerification;
    toast.error('Không tải được thiết lập chấm công của cửa hàng. Vui lòng thử lại.', 'Chấm công');
    return null;
  }

  async function pressFaceCheckin(mode: 'checkin' | 'checkout' | 'overtime') {
    if (!hasFaceEmbedding) {
      router.push('/face-enrollment' as any);
      return;
    }
    if (locating) return;
    const loc = await resolveLocation();
    if (loc.blocked) return;
    // Ngoài khu vực cửa hàng: máy chủ chặn mọi lượt chấm công (cả ngoài giờ, check-out) — báo trước, không mở camera.
    if (isOutside(loc.coords)) {
      toast.warning('Bạn đang ở ngoài khu vực cửa hàng.', 'Vị trí');
      return;
    }
    setFaceCheckinMode(mode);
  }

  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // Màn quét khuôn mặt (chế độ khuôn mặt): null = đóng.
  const [faceCheckinMode, setFaceCheckinMode] = useState<'checkin' | 'checkout' | 'overtime' | null>(null);

  type ScreenLocation = { coords: Coords | null; unavailable: boolean; blocked: 'permission' | 'services' | null };

  function markBlocked(reason: 'permission' | 'services'): ScreenLocation {
    setGpsBlocked(reason);
    setCoords(null);
    setGpsStatus('error');
    setGpsUnavailable(false);
    return { coords: null, unavailable: false, blocked: reason };
  }

  /**
   * Lấy vị trí ở màn chấm công — BẮT BUỘC trước khi chấm công (chủ 2026-10-21): vào màn là xin quyền ngay, định vị của máy
   * phải bật, thử lấy điểm GPS mới tới 5 giây. Chưa cho phép / tắt định vị → chặn (chip GPS + nút chỉ cách bật). Đã cho
   * phép + bật mà 5 giây vẫn không ra vị trí → GPS lỗi: vẫn cho chấm công, máy chủ ghi lần đó "không có vị trí".
   */
  async function fetchGps(): Promise<ScreenLocation> {
    setLocating(true);
    setGpsStatus('loading');
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted' && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      setGpsPerm({ granted: perm.status === 'granted', canAskAgain: perm.canAskAgain });
      if (perm.status !== 'granted') return markBlocked('permission');
      const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
      if (!servicesOn) return markBlocked('services');
      setGpsBlocked(null);
      const fresh = await retryLocation(async (remaining) => {
        const loc = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), remaining);
        return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
      });
      if (fresh) {
        setCoords(fresh);
        coordsAtRef.current = Date.now();
        setGpsStatus('ready');
        setGpsUnavailable(false);
        return { coords: fresh, unavailable: false, blocked: null };
      }
      setCoords(null);
      setGpsStatus('error');
      setGpsUnavailable(true);
      return { coords: null, unavailable: true, blocked: null };
    } finally {
      setLocating(false);
    }
  }

  /**
   * Bấm check-in / check-out: dùng lại vị trí vừa lấy (≤ LOCATION_FRESH_MS), không thì lấy lại. Bị chặn (chưa cho phép /
   * tắt định vị) → báo và không mở camera; GPS lỗi sau 5 giây → vẫn cho, máy chủ ghi "không có vị trí".
   */
  async function resolveLocation(): Promise<ScreenLocation> {
    if (coords && gpsStatus === 'ready' && Date.now() - coordsAtRef.current < LOCATION_FRESH_MS) {
      return { coords, unavailable: false, blocked: null };
    }
    const loc = await fetchGps();
    if (loc.blocked) {
      toast.error(
        loc.blocked === 'permission' ? 'Cần cho phép ứng dụng dùng vị trí để chấm công.' : 'Cần bật định vị (GPS) của máy để chấm công.',
        'GPS',
      );
    } else if (loc.unavailable) {
      toast.warning('Không lấy được GPS sau 5 giây — vẫn chấm công, lần này được ghi là không có vị trí.', 'GPS');
    }
    return loc;
  }

  /**
   * Vị trí cho lần GỬI chấm công (sau khi chụp ảnh / quét mặt xong): ping máy chủ rồi lấy điểm GPS mới — không gửi toạ độ
   * lấy từ lúc bấm nút hay lúc mở màn. Cập nhật luôn chip GPS trên màn.
   */
  async function locateForSubmit(): Promise<LocationFix> {
    const fix = await locateForAttendance();
    setGpsPerm(fix.permission);
    if (fix.blocked) {
      markBlocked(fix.blocked);
      throw new Error(
        fix.blocked === 'permission' ? 'Cần cho phép ứng dụng dùng vị trí để chấm công.' : 'Cần bật định vị (GPS) của máy để chấm công.',
      );
    }
    if (fix.coords) {
      setCoords(fix.coords);
      coordsAtRef.current = Date.now();
      setGpsStatus('ready');
      setGpsUnavailable(false);
    } else {
      setCoords(null);
      setGpsStatus('error');
      setGpsUnavailable(true);
      toast.warning('Không lấy được GPS sau 5 giây — vẫn chấm công, lần này được ghi là không có vị trí.', 'GPS');
    }
    return fix;
  }

  /** Vị trí vừa lấy nằm ngoài khu vực cửa hàng (cửa hàng có đặt toạ độ chi nhánh). */
  function isOutside(c: Coords | null): boolean {
    if (!c || !geofenceBranches) return false;
    const nearest = findNearestBranch(c, geofenceBranches);
    return !!nearest && !nearest.within;
  }

  // Vào màn là xin quyền + lấy vị trí ngay — chưa có vị trí ở màn này thì các nút chấm công chưa mở.
  useEffect(() => {
    void fetchGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quay lại app (vd từ Cài đặt sau khi bật vị trí) mà định vị đang bị chặn / lỗi → lấy lại.
  const gpsRecheckRef = useRef(false);
  gpsRecheckRef.current = !!gpsBlocked || gpsStatus === 'error';
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && gpsRecheckRef.current) void fetchGps();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openCheckInCamera(mode: 'smart' | 'overtime' = 'smart') {
    let granted = cameraPermission?.granted;
    if (!granted) granted = (await requestCameraPermission()).granted;
    if (!granted) {
      toast.error(t('checkin.cameraPermMsg'), t('checkin.cameraPermTitle'));
      return;
    }
    if (locating) return;
    haptics.light();
    setCheckinMode(mode);
    setActionKind('checkin');
    // Lấy vị trí trước (tối đa ~5 giây, nút hiện "Đang lấy vị trí GPS…"); GPS lỗi vẫn mở, máy chủ đánh dấu.
    const loc = await resolveLocation();
    if (loc.blocked) return;
    if (isOutside(loc.coords)) {
      toast.warning('Bạn đang ở ngoài khu vực cửa hàng.', 'Vị trí');
      return;
    }
    setModalOpen(true);
  }

  /** Bấm check-in (có ca phù hợp): quét mặt hoặc chụp ảnh tuỳ chế độ của cửa hàng. */
  async function pressCheckIn() {
    const face = await currentFaceMode();
    if (face === null) return;
    if (face) await pressFaceCheckin('checkin');
    else await openCheckInCamera('smart');
  }

  async function handleOvertimePress() {
    const face = await currentFaceMode();
    if (face === null) return;
    if (face && !hasFaceEmbedding) {
      router.push('/face-enrollment' as any);
      return;
    }
    const ok = await confirm({
      title: 'Check-in ngoài giờ',
      message: t('checkin.overtimeConfirm'),
      confirmText: 'Check-in',
    });
    if (!ok) return;
    if (!face) {
      await openCheckInCamera('overtime');
      return;
    }
    const loc = await resolveLocation();
    if (loc.blocked) return;
    if (isOutside(loc.coords)) {
      toast.warning('Bạn đang ở ngoài khu vực cửa hàng.', 'Vị trí');
      return;
    }
    setFaceCheckinMode('overtime');
  }

  async function handleConfirmCheckIn(base64: string, captureTime: Date) {
    setSubmitting(true);
    try {
      // 1. Ghi chấm công trước (vị trí lấy mới ngay lúc gửi, sau ping máy chủ); lỗi thì không gửi ảnh vào nhóm.
      const { fix } = await sendWithFreshLocation(locateForSubmit, (f) =>
        checkinMode === 'overtime'
          ? checkIn({ isOvertime: true, faceVerified: true, ...locationFields(f) })
          : smartCheckIn({ faceVerified: true, ...locationFields(f) }),
      );
      const at = fix.coords;
      // 2. Ảnh vào nhóm chấm công.
      await checkinFace({
        candidateName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Unknown',
        imageBase64: `data:image/jpeg;base64,${base64}`,
        lat: at?.latitude,
        lng: at?.longitude,
        time: captureTime.toISOString(),
      });
      setModalOpen(false);
      track(AnalyticsEvent.CheckInSuccess);
      setSuccessMsg(checkinMode === 'overtime' ? 'Check-in ngoài giờ thành công!' : t('checkin.checkInSuccess'));
      await refetch();
    } catch (err: any) {
      haptics.error();
      toast.error(extractApiError(err), t('checkin.checkInFailed'));
      // Cửa hàng vừa đổi luồng chấm công (máy chủ trả Attendance.FaceRequired): nạp lại thiết lập để đổi nút.
      void settingsQ.refetch();
      // Chủ cửa hàng vừa tắt chấm công trên app với người này: nạp lại /users/me để tab chuyển sang báo đã tắt.
      if (isPlatformFeatureDisabledError(err)) {
        setModalOpen(false);
        refreshUser();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function openCheckOutCamera() {
    const face = await currentFaceMode();
    if (face === null) return;
    if (face && !hasFaceEmbedding) {
      router.push('/face-enrollment' as any);
      return;
    }
    const ok = await confirm({
      title: t('common.confirm'),
      message: t('checkin.confirmCheckOut'),
      confirmText: t('checkin.checkOutBtn'),
      destructive: true,
    });
    if (!ok) return;
    if (locating) return;
    const loc = await resolveLocation();
    if (loc.blocked) return;
    if (isOutside(loc.coords)) {
      toast.warning('Bạn đang ở ngoài khu vực cửa hàng.', 'Vị trí');
      return;
    }
    if (face) {
      setFaceCheckinMode('checkout');
      return;
    }

    let granted = cameraPermission?.granted;
    if (!granted) granted = (await requestCameraPermission()).granted;
    if (!granted) {
      toast.error(t('checkin.cameraPermMsg'), t('checkin.cameraPermTitle'));
      return;
    }
    haptics.light();
    setActionKind('checkout');
    setModalOpen(true);
  }

  async function handleConfirmCheckOut(base64: string, captureTime: Date) {
    setSubmitting(true);
    try {
      // Vị trí lấy mới ngay lúc gửi (sau ping máy chủ, thử lại 5 giây); không có → máy chủ ghi "không có GPS".
      const { fix } = await sendWithFreshLocation(locateForSubmit, (f) => smartCheckOut({ faceVerified: true, ...locationFields(f) }));
      const at = fix.coords;
      // Ảnh vào nhóm chấm công — tái dùng đúng luồng checkin-face như lúc check-in.
      await checkinFace({
        candidateName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Unknown',
        imageBase64: `data:image/jpeg;base64,${base64}`,
        lat: at?.latitude,
        lng: at?.longitude,
        time: captureTime.toISOString(),
      });
      setModalOpen(false);
      track(AnalyticsEvent.CheckOutSuccess);
      setSuccessMsg(t('checkin.checkOutSuccess'));
      await refetch();
    } catch (err: any) {
      haptics.error();
      toast.error(extractApiError(err), t('checkin.checkOutFailed'));
      void settingsQ.refetch();
      // Chủ cửa hàng vừa tắt chấm công trên app với người này: nạp lại /users/me để tab chuyển sang báo đã tắt.
      if (isPlatformFeatureDisabledError(err)) {
        setModalOpen(false);
        refreshUser();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const baseGpsChip = {
    idle: { icon: 'map-marker-outline' as IconName, label: t('checkin.gpsIdle'), cls: 'bg-bg', tone: 'muted' as const },
    loading: { icon: 'map-marker-radius' as IconName, label: t('checkin.gpsLoading'), cls: 'bg-warning-soft', tone: 'warning' as const },
    ready: { icon: 'map-marker-check' as IconName, label: t('checkin.gpsReady'), cls: 'bg-success-soft', tone: 'success' as const },
    error: {
      icon: 'map-marker-off' as IconName,
      label:
        gpsBlocked === 'permission'
          ? t('checkin.gpsDenied')
          : gpsBlocked === 'services'
            ? 'Định vị (GPS) của máy đang tắt'
            : t('checkin.gpsError'),
      cls: 'bg-error-soft',
      tone: 'error' as const,
    },
  }[gpsStatus];
  // Hành động trên chip GPS: chưa cho phép → "Cho phép" (hộp xin quyền) / "Mở cài đặt" (đã chặn hẳn); định vị tắt → "Mở
  // cài đặt"; lỗi khác → "Thử lại".
  const gpsAction =
    gpsStatus === 'idle'
      ? t('checkin.gpsAllow')
      : gpsStatus === 'error'
        ? gpsBlocked === 'services' || (gpsBlocked === 'permission' && gpsPerm && !gpsPerm.canAskAgain)
          ? t('checkin.gpsOpenSettings')
          : gpsBlocked === 'permission'
            ? t('checkin.gpsAllow')
            : t('checkin.gpsRetry')
        : null;
  function onGpsChipPress() {
    if (locating) return;
    if (gpsBlocked === 'permission' && gpsPerm && !gpsPerm.canAskAgain) {
      void Linking.openSettings();
      return;
    }
    if (gpsBlocked === 'services') {
      // Android mở thẳng màn bật vị trí; iOS chỉ mở được Cài đặt của app.
      if (Platform.OS === 'android') {
        Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS').catch(() => Linking.openSettings());
      } else {
        void Linking.openSettings();
      }
      return;
    }
    if (gpsStatus === 'idle' || gpsStatus === 'error') void fetchGps();
  }

  /** Đã có vị trí ở màn này (hoặc GPS lỗi dù đã cho phép + bật định vị) → mới mở các nút chấm công. */
  const gpsGateOpen = !gpsBlocked && !locating && (gpsStatus === 'ready' || gpsUnavailable);
  /** Đang lấy vị trí → nút chờ (khoá); bị chặn → nút dẫn đi bật vị trí. */
  const gpsWaiting = !gpsGateOpen && !gpsBlocked;
  const gpsLockLabel =
    gpsBlocked === 'permission'
      ? 'Cho phép vị trí để chấm công'
      : gpsBlocked === 'services'
        ? 'Bật định vị để chấm công'
        : 'Đang lấy vị trí GPS…';
  /** Nhãn nút chấm công: chưa mở (chưa có vị trí) thì báo vị trí. */
  const gpsLabel = (label: string) => (gpsGateOpen ? label : gpsLockLabel);
  /** Bấm nút chấm công: bị chặn định vị thì đi bật vị trí; chưa có vị trí thì chưa làm gì. */
  const withGps = (action: () => unknown) => () => {
    if (gpsBlocked) {
      onGpsChipPress();
      return;
    }
    if (gpsGateOpen) void action();
  };
  // Ngoài khu vực cửa hàng → chip cảnh báo (đè lên trạng thái "ready" xanh).
  const gpsChip = outsideStore
    ? { icon: 'map-marker-off' as IconName, label: 'Ngoài khu vực cửa hàng', cls: 'bg-warning-soft', tone: 'warning' as const }
    : baseGpsChip;

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refetch}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-1">
        {/* Shell chủ cửa hàng không có tab Điểm danh — mở từ Tiện ích thì cần nút quay lại. */}
        {usesAdminShell(user) ? (
          <Pressable onPress={goBackOrHome} accessibilityLabel={t('common.back')} className="w-10 h-10 -ml-2 mr-1 items-center justify-center rounded-full self-start">
            <Icon name="chevron-left" size={26} tone="default" />
          </Pressable>
        ) : null}
        <View className="flex-1">
          <Text variant="bodySmall" tone="muted">{dayjs().format('dddd, DD/MM/YYYY')}</Text>
          <Text variant="title" className="mt-0.5">{t('common.greeting', { name: user?.firstName ?? '' })}</Text>
          <BranchSwitcher />
        </View>
        <Pressable
          onPress={() => router.push('/notifications' as any)}
          className="w-10 h-10 rounded-full bg-surface dark:bg-surface-dark items-center justify-center"
        >
          <Icon name="bell-outline" size={22} tone="default" />
        </Pressable>
      </View>

      {/* Hero card — faux glass: hairline border + subtle inner top-highlight */}
      <BrandGradient
        className="rounded-[28px] "
        style={{
          backgroundColor: 'transparent',
          shadowOpacity: 0.25,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
        }}
        variant="brand"
      >
        {/* Inner top glow (glass light-source simulation) */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 60,
            borderTopLeftRadius: 27, borderTopRightRadius: 27,
            backgroundColor: 'rgba(255,255,255,0.08)',
          }}
        />

        <View className="px-6 pt-6 pb-5 items-center gap-2">
          {isCheckedIn ? (
            <>
              {/* Status pill */}
              <View className="flex-row items-center gap-2 px-3 py-1 rounded-full bg-white/20 mb-1">
                <MotiView
                  from={{ scale: 0.7, opacity: 0.6 }}
                  animate={{ scale: 1.25, opacity: 1 }}
                  transition={{ loop: true, repeatReverse: true, type: 'timing', duration: 800 }}
                  // MotiView không nhận className (NativeWind) — kích thước/màu qua style.
                  style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' }}
                />
                <Text className="text-white font-bold tracking-wider text-[12px]">{t('checkin.working')}</Text>
              </View>
              {/* Đồng hồ đếm thời gian ĐÃ LÀM (live) — giống core-fe */}
              <Text className="text-white text-[46px] leading-[52px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                {formatElapsed(activeLog?.checkInTime, now)}
              </Text>
              <Text className="text-white/70 text-[11px] -mt-1">thời gian đã làm</Text>
              <Text className="text-white/85 text-[13px] text-center mt-0.5">
                Check-in lúc {formatTime(activeLog?.checkInTime)}
                {activeLog?.isLate ? `  ·  ${t('checkin.late', { n: activeLog.lateMinutes })}` : `  ·  ${t('checkin.onTime')}`}
              </Text>
              {/* White CTA — stays legible on the rose hero */}
              <Pressable
                onPress={withGps(openCheckOutCamera)}
                disabled={submitting || gpsWaiting}
                className="mt-4 w-full h-[52px] rounded-2xl bg-white flex-row items-center justify-center gap-2"
                style={softShadow}
              >
                {submitting || gpsWaiting ? (
                  <Spinner color={brand.error} />
                ) : (
                  <Icon name={gpsBlocked ? 'map-marker-off' : faceMode ? 'face-recognition' : 'logout'} size={20} color={brand.error} />
                )}
                {/* tone="error" thay vì className="text-error": tone mặc định kèm
                    dark:text-ink-dark (trắng) đè text-error ở dark → chữ trắng
                    trên nút trắng, mất chữ Checkout. */}
                <Text tone="error" className="font-bold text-[16px]">
                  {gpsLabel(needsEnroll ? t('checkin.enrollToCheckOut') : t('checkin.checkOutBtn'))}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Status pill */}
              <View className={cn('flex-row items-center gap-1.5 px-3 py-1 rounded-full mb-1', canCheckIn ? 'bg-white/25' : 'bg-white/15')}>
                <Icon name={canCheckIn ? 'check-circle' : 'clock-outline'} size={14} color="#FFFFFF" />
                <Text className="text-white font-bold tracking-wider text-[12px]">
                  {canCheckIn ? t('checkin.ready') : shifts.length === 0 ? t('checkin.noShiftPill') : t('checkin.notYet')}
                </Text>
              </View>
              <Text className="text-white text-[52px] leading-[58px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </Text>
              <Text className="text-white/85 text-[13px] text-center leading-[18px]">
                {canCheckIn
                  ? `Ca ${activeCheckinShift?.shiftName} · ${activeCheckinShift?.startTime} – ${activeCheckinShift?.endTime}`
                  : shifts.length === 0
                    ? t('checkin.noShiftHint')
                    : disabledReason ?? 'Hệ thống tự nhận diện ca phù hợp'}
              </Text>

              {canCheckIn ? (
                <>
                  {!outsideStore ? (
                    // Trong khu vực / chưa có vị trí / GPS lỗi → check-in thường (bấm là lấy vị trí, thử lại 5 giây).
                    <Pressable
                      onPress={withGps(pressCheckIn)}
                      disabled={submitting || gpsWaiting}
                      className="mt-4 w-full h-[52px] rounded-2xl bg-white flex-row items-center justify-center gap-2"
                      style={softShadow}
                    >
                      {submitting || gpsWaiting ? (
                        <Spinner color={brand.primary} />
                      ) : (
                        <Icon
                          name={gpsBlocked ? 'map-marker-off' : faceMode ? 'face-recognition' : 'camera-account'}
                          size={20}
                          color={brand.primary}
                        />
                      )}
                      <Text className="text-primary font-bold text-[16px]">
                        {gpsLabel(needsEnroll ? t('checkin.enrollToCheckIn') : t('checkin.checkInBtn'))}
                      </Text>
                    </Pressable>
                  ) : (
                    // Ngoài khu vực cửa hàng: không chấm công (kể cả ngoài giờ — chủ 2026-10-21; máy chủ cũng chặn).
                    <View className="mt-4 w-full h-[52px] rounded-2xl bg-white/15 border border-white/30 flex-row items-center justify-center gap-2">
                      <Icon name="map-marker-off" size={18} color="rgba(255,255,255,0.9)" />
                      <Text className="text-white/90 font-bold text-[14px]">Ngoài khu vực cửa hàng</Text>
                    </View>
                  )}
                </>
              ) : shifts.length === 0 ? (
                // Hôm nay chưa được xếp ca: đang ở cửa hàng thì check-in ngoài giờ (chỉ ghi giờ để đối chiếu cuối tháng,
                // không tính lương); hoặc đăng ký ca / nhận ca trên chợ ca cho những ngày tới.
                <View className="mt-4 w-full gap-2">
                  <Pressable
                    onPress={withGps(handleOvertimePress)}
                    disabled={submitting || gpsWaiting}
                    className="w-full h-[52px] rounded-2xl bg-white flex-row items-center justify-center gap-2"
                    style={softShadow}
                  >
                    {gpsWaiting ? (
                      <Spinner color={brand.primary} />
                    ) : (
                      <Icon
                        name={gpsBlocked ? 'map-marker-off' : needsEnroll ? 'face-recognition' : 'clock-plus-outline'}
                        size={20}
                        color={brand.primary}
                      />
                    )}
                    <Text className="text-primary font-bold text-[16px]">{gpsLabel(t('checkin.overtimeBtn'))}</Text>
                  </Pressable>
                  <Text className="text-white/80 text-[12px] leading-[16px] text-center">
                    {needsEnroll ? t('checkin.overtimeNeedsFace') : t('checkin.overtimeNote')}
                  </Text>
                  <View className="flex-row gap-2 mt-1">
                    <Pressable
                      onPress={() => router.push('/shift-register' as any)}
                      className="flex-1 h-[46px] rounded-2xl bg-white/15 border border-white/30 flex-row items-center justify-center gap-1.5 px-2"
                    >
                      <Icon name="calendar-plus" size={18} color="#FFFFFF" />
                      <Text className="text-white font-bold text-[14px] flex-shrink" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('checkin.registerShiftBtn')}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => router.push('/shift-pool' as any)}
                      className="flex-1 h-[46px] rounded-2xl bg-white/15 border border-white/30 flex-row items-center justify-center gap-1.5 px-2"
                    >
                      <Icon name="hand-heart" size={18} color="#FFFFFF" />
                      <Text className="text-white font-bold text-[14px] flex-shrink" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('checkin.shiftPoolBtn')}</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                // Disabled state — translucent glass so it stays visible on rose
                <View className="mt-4 w-full h-[52px] rounded-2xl bg-white/15 border border-white/30 flex-row items-center justify-center gap-2">
                  <Icon name="clock-outline" size={18} color="rgba(255,255,255,0.9)" />
                  <Text className="text-white/90 font-bold text-[15px]">{t('checkin.notYetBtn')}</Text>
                </View>
              )}

              {/* Check-in ngoài giờ — khi không có ca phù hợp lúc này */}
              {!canCheckIn && shifts.length > 0 ? (
                <Pressable
                  onPress={withGps(handleOvertimePress)}
                  disabled={gpsWaiting}
                  className="mt-3 flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15"
                >
                  <Icon name={gpsBlocked ? 'map-marker-off' : 'clock-plus-outline'} size={16} color="#FFFFFF" />
                  <Text className="text-white font-semibold text-[13px]">
                    {gpsLabel(needsEnroll ? 'Đăng ký khuôn mặt để check-in' : 'Check-in ngoài giờ')}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>

        {/* Shift progress bar — only shown while checked in */}
        {isCheckedIn && shiftProgress > 0 ? (
          <View style={{ paddingHorizontal: 24, paddingBottom: 16, gap: 4 }}>
            <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: 'rgba(255,255,255,0.82)',
                  width: `${Math.round(shiftProgress * 100)}%`,
                }}
              />
            </View>
            <Text className="text-white/45 text-[10px] text-right">
              {Math.round(shiftProgress * 100)}% ca làm
            </Text>
          </View>
        ) : null}
      </BrandGradient>

      {/* GPS chip */}
      <Pressable onPress={gpsAction ? onGpsChipPress : undefined} accessibilityRole={gpsAction ? 'button' : undefined}>
        <View className={cn('flex-row items-center gap-1.5 px-3.5 py-2 rounded-full', gpsChip.cls)}>
          <Icon name={gpsChip.icon} size={16} tone={gpsChip.tone} />
          <Text variant="bodySmall" tone={gpsChip.tone} className="font-semibold flex-1">{gpsChip.label}</Text>
          {gpsAction ? (
            <View className="px-2.5 py-1 rounded-full bg-white/70 dark:bg-white/10">
              <Text variant="caption" tone={gpsChip.tone} className="font-bold">{gpsAction}</Text>
            </View>
          ) : null}
          {gpsStatus === 'ready' && coords ? (
            <Text variant="caption" tone={gpsChip.tone}>
              {nearestBranch
                ? `${nearestBranch.within ? '✅' : '❌'} ${formatDistance(nearestBranch.distance)}`
                : branchDistanceM != null
                  ? `Cách cửa hàng ${formatDistance(branchDistanceM)}`
                  : `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/* Có ca nhưng đang ở ngoài khu vực cửa hàng → không chấm công được, phải tới cửa hàng */}
      {canCheckIn && outsideStore ? (
        <View className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl bg-warning-soft">
          <Icon name="map-marker-off" size={16} tone="warning" />
          <Text variant="bodySmall" tone="warning" className="font-semibold flex-1">
            Bạn đang ở ngoài khu vực cửa hàng — tới cửa hàng để chấm công.
          </Text>
        </View>
      ) : null}

      {/* Shifts */}
      <SectionCard title={t('checkin.todayShifts')} icon="calendar-clock" count={shifts.length} collapsible bodyClassName="pt-0">
        {shifts.length === 0 ? (
          <Text tone="muted" className="text-center py-3">{t('checkin.noShiftToday')}</Text>
        ) : (
          shifts.map((s, i) => (
            <View key={s.assignmentId}>
              {i > 0 ? <Divider /> : null}
              <ShiftRow shift={s} now={nowD} />
            </View>
          ))
        )}
      </SectionCard>

      {/* Checklist vệ sinh — thẻ tóm tắt, bấm vào mở màn checklist đầy đủ */}
      <CleaningChecklistSummaryCard />

      {/* Stats tuần này — số ca được phân / vắng mặt / đi muộn */}
      {report ? (
        <View className="flex-row gap-2.5">
          <StatCard tone="success" value={report.totalShifts} label={t('checkin.statShifts')} />
          <StatCard tone="error" value={report.absentShifts} label={t('checkin.statAbsent')} />
          <StatCard tone="warning" value={report.lateCount} label={t('checkin.statLate')} />
        </View>
      ) : null}

      {/* Today's history */}
      <SectionCard title={t('checkin.todayHistory')} icon="history" count={logs.length} collapsible defaultExpanded={false}>
        {logs.length === 0 ? (
          <EmptyState icon="history" title="Chưa có dữ liệu điểm danh hôm nay" />
        ) : (
          logs.map((log, i) => (
            <View key={log.id}>
              {i > 0 ? <Divider className="my-2.5" /> : null}
              <View className="flex-row items-center gap-3 py-1">
                <View className="items-center gap-0.5">
                  <Icon name="login" size={14} tone="primary" />
                  <Text variant="caption" tone="muted">IN</Text>
                  <Text variant="subtitle" tone="primary">{formatTime(log.checkInTime)}</Text>
                </View>
                <Icon name="arrow-right" size={18} tone="faint" />
                <View className="items-center gap-0.5">
                  <Icon name="logout" size={14} tone="error" />
                  <Text variant="caption" tone="muted">OUT</Text>
                  <Text variant="subtitle" tone="error">{formatTime(log.checkOutTime)}</Text>
                </View>
                <View className="flex-1 items-end gap-1">
                  {log.isLate ? <Badge tone="warning">{t('checkin.late', { n: log.lateMinutes })}</Badge> : null}
                  {log.faceVerified ? <Badge tone="success" icon="check-decagram">Verified</Badge> : null}
                </View>
              </View>
            </View>
          ))
        )}
      </SectionCard>

      <FaceCaptureModal
        visible={modalOpen}
        coords={coords}
        address={overlayAddress}
        gpsStatus={gpsStatus}
        // Check-out KHÔNG phụ thuộc GPS như check-in (không có khái niệm "ca phù hợp"
        // để tính fallback) — giữ đúng hành vi cũ là checkout vẫn được dù GPS lỗi,
        // chỉ chặn vì thiếu ảnh (yêu cầu mới), không chặn thêm vì vị trí.
        canSubmit={actionKind === 'checkout' ? true : gpsStatus === 'ready' || gpsUnavailable}
        loading={submitting}
        onClose={() => setModalOpen(false)}
        onConfirm={actionKind === 'checkout' ? handleConfirmCheckOut : handleConfirmCheckIn}
        title={actionKind === 'checkout' ? 'Chụp ảnh check-out' : undefined}
        confirmLabel={actionKind === 'checkout' ? t('checkin.checkOutBtn') : undefined}
      />

      <SuccessOverlay visible={!!successMsg} message={successMsg ?? undefined} onDone={() => setSuccessMsg(null)} />

      <FaceCheckinModal
        visible={faceCheckinMode !== null}
        mode={faceCheckinMode ?? 'checkin'}
        locate={locateForSubmit}
        onClose={() => setFaceCheckinMode(null)}
        onSuccess={() => {
          const isOut = faceCheckinMode === 'checkout';
          track(isOut ? AnalyticsEvent.CheckOutSuccess : AnalyticsEvent.CheckInSuccess);
          setSuccessMsg(
            isOut
              ? t('checkin.checkOutSuccess')
              : faceCheckinMode === 'overtime'
                ? 'Check-in ngoài giờ thành công!'
                : t('checkin.checkInSuccess')
          );
          refetch();
        }}
      />
    </Screen>
  );
}
