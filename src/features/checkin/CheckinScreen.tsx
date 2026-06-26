import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { MotiView } from 'moti';
import { router } from 'expo-router';
import { useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';

import { Screen, SectionCard, StatCard, EmptyState } from 'src/components/shared';
import { Text, Button, Badge, Card, Icon, Pressable, Divider, BrandGradient, Appear, SuccessOverlay, Spinner, type IconName } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand, softShadow } from 'src/theme';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';
import { useQuery } from '@tanstack/react-query';

import { smartCheckIn, smartCheckOut, checkIn, checkinFace, getBranchLocations } from 'src/api/attendance';
import { extractApiError } from 'src/services/error';
import { track, AnalyticsEvent } from 'src/services/analytics';
import { t } from 'src/i18n';

import { useCheckinData } from './hooks';
import { FaceCaptureModal } from './FaceCaptureModal';
import {
  getCheckInWindow,
  getActiveCheckinShift,
  getNextUpcomingShift,
  formatTime,
  formatCountdown,
  nearestBranchDistance,
  formatDistance,
  type Coords,
  type GpsStatus,
} from './utils';
import type { IMyScheduleItem } from 'src/types/corecms-api';

dayjs.locale('vi');

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

const QUICK_ACTIONS: { icon: IconName; label: string; tone: 'info' | 'warning' | 'secondary' | 'error' | 'success'; route: string; disabled?: boolean }[] = [
  { icon: 'cash-register', label: 'Kiểm tiền\nquầy', tone: 'success', route: '/shift-cash' },
  { icon: 'calendar-plus', label: 'Đăng ký\nca', tone: 'secondary', route: '/shift-register' },
  { icon: 'chart-bar', label: 'Báo cáo\ncông', tone: 'error', route: '/(tabs)/payroll' },
  { icon: 'clipboard-text-outline', label: 'Yêu cầu\nđiều chỉnh', tone: 'info', route: '/attendance', disabled: true },
];

const quickBg: Record<string, string> = {
  info: 'bg-info-soft',
  warning: 'bg-warning-soft',
  secondary: 'bg-secondary-soft',
  error: 'bg-error-soft',
  success: 'bg-success-soft',
};

const quickTextCls: Record<string, string> = {
  info: 'text-info',
  warning: 'text-warning-text',
  secondary: 'text-info',
  error: 'text-error',
  success: 'text-success',
};

// ── Screen ───────────────────────────────────────────────────────────────────
export function CheckinScreen() {
  const { user } = useAuthContext();
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
  const [coords, setCoords] = useState<Coords | null>(null);
  // Chi nhánh (cửa hàng) để tính & hiển thị khoảng cách GPS cho người dùng
  const branchesQ = useQuery({ queryKey: ['branches'], queryFn: getBranchLocations, staleTime: 60 * 60 * 1000 });
  const branchDistanceM = coords && branchesQ.data ? nearestBranchDistance(coords, branchesQ.data) : null;
  // Check-in ngoài giờ + fallback khi GPS lỗi (đồng bộ hành vi core-fe)
  const [checkinMode, setCheckinMode] = useState<'smart' | 'overtime'>('smart');
  const [gpsCountdown, setGpsCountdown] = useState<number | null>(null);
  const [gpsFallback, setGpsFallback] = useState(false);

  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function fetchGps(): Promise<Coords | null> {
    setGpsStatus('loading');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setGpsStatus('error'); return null; }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const c: Coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
      setCoords(c);
      setGpsStatus('ready');
      return c;
    } catch {
      setGpsStatus('error');
      return null;
    }
  }

  // Tự lấy GPS khi mở màn để hiện trạng thái + kích hoạt đếm ngược fallback nếu lỗi
  useEffect(() => {
    fetchGps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GPS lỗi → đếm ngược 5s rồi cho phép check-in chỉ-ảnh (không kèm toạ độ)
  useEffect(() => {
    if (gpsStatus === 'error') {
      setGpsCountdown((c) => (c === null ? 5 : c));
    } else if (gpsStatus === 'ready') {
      setGpsCountdown(null);
      setGpsFallback(false);
    }
  }, [gpsStatus]);

  useEffect(() => {
    if (gpsCountdown === null) return;
    if (gpsCountdown <= 0) {
      setGpsFallback(true);
      return;
    }
    const tmr = setTimeout(() => setGpsCountdown((n) => (n !== null ? n - 1 : null)), 1000);
    return () => clearTimeout(tmr);
  }, [gpsCountdown]);

  async function openCheckInCamera(mode: 'smart' | 'overtime' = 'smart') {
    let granted = cameraPermission?.granted;
    if (!granted) granted = (await requestCameraPermission()).granted;
    if (!granted) {
      toast.error(t('checkin.cameraPermMsg'), t('checkin.cameraPermTitle'));
      return;
    }
    haptics.light();
    setCheckinMode(mode);
    setSubmitting(true);
    const c = await fetchGps();
    setSubmitting(false);
    // Cho phép tiếp tục nếu có GPS, hoặc đã bật fallback (sau 5s GPS lỗi)
    if (!c && !gpsFallback) {
      toast.warning('Chưa lấy được vị trí. Nếu GPS lỗi, nút sẽ tự cho phép check-in không kèm vị trí sau vài giây.', 'Đang lấy GPS…');
      return;
    }
    setModalOpen(true);
  }

  async function handleOvertimePress() {
    const ok = await confirm({
      title: 'Check-in ngoài giờ',
      message: 'Bạn không có ca phù hợp lúc này. Tiếp tục check-in ngoài giờ (ghi nhận làm thêm)?',
      confirmText: 'Check-in',
    });
    if (ok) openCheckInCamera('overtime');
  }

  async function handleConfirmCheckIn(base64: string, captureTime: Date) {
    setSubmitting(true);
    try {
      // 1. Create attendance log first; abort before Telegram if it fails.
      if (checkinMode === 'overtime') {
        await checkIn({
          isOvertime: true,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          accuracy: coords?.accuracy,
          faceVerified: true,
        });
      } else {
        await smartCheckIn({
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          accuracy: coords?.accuracy,
          faceVerified: true,
        });
      }
      // 2. Fire Telegram face notification.
      await checkinFace({
        candidateName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Unknown',
        imageBase64: `data:image/jpeg;base64,${base64}`,
        lat: coords?.latitude,
        lng: coords?.longitude,
        time: captureTime.toISOString(),
      });
      setModalOpen(false);
      track(AnalyticsEvent.CheckInSuccess);
      setSuccessMsg(checkinMode === 'overtime' ? 'Check-in ngoài giờ thành công!' : t('checkin.checkInSuccess'));
      await refetch();
    } catch (err: any) {
      haptics.error();
      toast.error(extractApiError(err), t('checkin.checkInFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCheckOut() {
    const ok = await confirm({
      title: t('common.confirm'),
      message: t('checkin.confirmCheckOut'),
      confirmText: t('checkin.checkOutBtn'),
      destructive: true,
    });
    if (!ok) return;
    setSubmitting(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      let c: Coords | undefined;
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        c = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
      }
      await smartCheckOut({ latitude: c?.latitude, longitude: c?.longitude, accuracy: c?.accuracy });
      track(AnalyticsEvent.CheckOutSuccess);
      setSuccessMsg(t('checkin.checkOutSuccess'));
      await refetch();
    } catch (err: any) {
      haptics.error();
      toast.error(extractApiError(err), t('checkin.checkOutFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const gpsChip = {
    idle: { icon: 'map-marker-outline' as IconName, label: t('checkin.gpsIdle'), cls: 'bg-bg', tone: 'muted' as const },
    loading: { icon: 'map-marker-radius' as IconName, label: t('checkin.gpsLoading'), cls: 'bg-warning-soft', tone: 'warning' as const },
    ready: { icon: 'map-marker-check' as IconName, label: t('checkin.gpsReady'), cls: 'bg-success-soft', tone: 'success' as const },
    error: { icon: 'map-marker-off' as IconName, label: t('checkin.gpsError'), cls: 'bg-error-soft', tone: 'error' as const },
  }[gpsStatus];

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refetch}>
      {/* Header */}
      <View className="flex-row items-center justify-between mb-1">
        <View>
          <Text variant="bodySmall" tone="muted">{dayjs().format('dddd, DD/MM/YYYY')}</Text>
          <Text variant="title" className="mt-0.5">{t('common.greeting', { name: user?.firstName ?? '' })}</Text>
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
                  className="w-2.5 h-2.5 rounded-full bg-white"
                />
                <Text className="text-white font-bold tracking-wider text-[12px]">{t('checkin.working')}</Text>
              </View>
              <Text className="text-white text-[52px] leading-[58px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>{formatTime(activeLog?.checkInTime)}</Text>
              <Text className="text-white/85 text-[13px] text-center">
                Check-in lúc {formatTime(activeLog?.checkInTime)}
                {activeLog?.isLate ? `  ·  ${t('checkin.late', { n: activeLog.lateMinutes })}` : `  ·  ${t('checkin.onTime')}`}
              </Text>
              {/* White CTA — stays legible on the rose hero */}
              <Pressable
                onPress={handleCheckOut}
                disabled={submitting}
                className="mt-4 w-full h-[52px] rounded-2xl bg-white flex-row items-center justify-center gap-2"
                style={softShadow}
              >
                {submitting ? <Spinner color={brand.error} /> : <Icon name="logout" size={20} color={brand.error} />}
                <Text className="text-error font-bold text-[16px]">{t('checkin.checkOutBtn')}</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Status pill */}
              <View className={cn('flex-row items-center gap-1.5 px-3 py-1 rounded-full mb-1', canCheckIn ? 'bg-white/25' : 'bg-white/15')}>
                <Icon name={canCheckIn ? 'check-circle' : 'clock-outline'} size={14} color="#FFFFFF" />
                <Text className="text-white font-bold tracking-wider text-[12px]">
                  {canCheckIn ? t('checkin.ready') : t('checkin.notYet')}
                </Text>
              </View>
              <Text className="text-white text-[52px] leading-[58px] font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </Text>
              <Text className="text-white/85 text-[13px] text-center leading-[18px]">
                {canCheckIn
                  ? `Ca ${activeCheckinShift?.shiftName} · ${activeCheckinShift?.startTime} – ${activeCheckinShift?.endTime}`
                  : disabledReason ?? 'Hệ thống tự nhận diện ca phù hợp'}
              </Text>

              {canCheckIn ? (
                <Pressable
                  onPress={() => openCheckInCamera('smart')}
                  disabled={submitting}
                  className="mt-4 w-full h-[52px] rounded-2xl bg-white flex-row items-center justify-center gap-2"
                  style={softShadow}
                >
                  {submitting ? <Spinner color={brand.primary} /> : <Icon name="camera-account" size={20} color={brand.primary} />}
                  <Text className="text-primary font-bold text-[16px]">{t('checkin.checkInBtn')}</Text>
                </Pressable>
              ) : (
                // Disabled state — translucent glass so it stays visible on rose
                <View className="mt-4 w-full h-[52px] rounded-2xl bg-white/15 border border-white/30 flex-row items-center justify-center gap-2">
                  <Icon name="clock-outline" size={18} color="rgba(255,255,255,0.9)" />
                  <Text className="text-white/90 font-bold text-[15px]">{t('checkin.notYetBtn')}</Text>
                </View>
              )}

              {/* Check-in ngoài giờ — khi không có ca phù hợp lúc này */}
              {!canCheckIn ? (
                <Pressable onPress={handleOvertimePress} className="mt-3 flex-row items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15">
                  <Icon name="clock-plus-outline" size={16} color="#FFFFFF" />
                  <Text className="text-white font-semibold text-[13px]">Check-in ngoài giờ</Text>
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
      <Pressable onPress={gpsStatus === 'idle' || gpsStatus === 'error' ? fetchGps : undefined}>
        <View className={cn('flex-row items-center gap-1.5 px-3.5 py-2 rounded-full', gpsChip.cls)}>
          <Icon name={gpsChip.icon} size={16} tone={gpsChip.tone} />
          <Text variant="bodySmall" tone={gpsChip.tone} className="font-semibold flex-1">{gpsChip.label}</Text>
          {gpsStatus === 'ready' && coords ? (
            <Text variant="caption" tone={gpsChip.tone}>
              {branchDistanceM != null
                ? `Cách cửa hàng ${formatDistance(branchDistanceM)}`
                : `${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/* GPS lỗi → đếm ngược rồi cho phép check-in không cần GPS (giống core-fe) */}
      {gpsStatus === 'error' ? (
        <View className={cn('flex-row items-center gap-1.5 px-3.5 py-2 rounded-xl', gpsFallback ? 'bg-success-soft' : 'bg-warning-soft')}>
          <Icon name={(gpsFallback ? 'camera-check' : 'timer-sand') as IconName} size={16} tone={gpsFallback ? 'success' : 'warning'} />
          <Text variant="bodySmall" tone={gpsFallback ? 'success' : 'warning'} className="font-semibold flex-1">
            {gpsFallback
              ? 'Đã bật check-in không cần GPS — bạn có thể chụp ảnh để check-in.'
              : `Không lấy được GPS. Cho phép check-in không cần GPS sau ${gpsCountdown ?? 0}s…`}
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

      {/* Stats tuần này — số ca được phân / vắng mặt / đi muộn */}
      {report ? (
        <View className="flex-row gap-2.5">
          <StatCard tone="success" value={report.totalShifts} label={t('checkin.statShifts')} />
          <StatCard tone="error" value={report.absentShifts} label={t('checkin.statAbsent')} />
          <StatCard tone="warning" value={report.lateCount} label={t('checkin.statLate')} />
        </View>
      ) : null}

      {/* Quick actions — 2-up grid */}
      <View className="flex-row flex-wrap gap-2.5">
        {QUICK_ACTIONS.map((a) => (
          <Pressable
            key={a.label}
            onPress={a.disabled ? undefined : () => router.push(a.route as any)}
            className={cn(
              'items-center justify-center py-4 rounded-2xl gap-2 relative',
              quickBg[a.tone],
              a.disabled && 'opacity-50',
            )}
            style={{ width: '48%' }}
          >
            <Icon name={a.icon} size={26} tone={a.tone} />
            <Text
              variant="caption"
              numberOfLines={2}
              className={cn('text-center font-semibold leading-4', quickTextCls[a.tone])}
            >
              {a.label.replace('\n', ' ')}
            </Text>
            {a.disabled ? (
              <View
                className="absolute top-1.5 right-1.5 rounded-full px-1.5 py-0.5 bg-surface dark:bg-surface-dark"
                style={{ borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.08)' }}
              >
                <Text variant="caption" className="text-[9px] text-faint font-semibold">Sắp có</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>

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
        loading={submitting}
        onClose={() => setModalOpen(false)}
        onConfirm={handleConfirmCheckIn}
      />

      <SuccessOverlay visible={!!successMsg} message={successMsg ?? undefined} onDone={() => setSuccessMsg(null)} />
    </Screen>
  );
}
