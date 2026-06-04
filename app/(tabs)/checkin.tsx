import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Image,
  StatusBar,
  Animated,
} from 'react-native';
import { Text, Card, Button, Chip, Divider, useTheme, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  smartCheckIn,
  smartCheckOut,
  getMyAttendanceLogs,
  getMyAttendanceReport,
  checkinFace,
} from 'src/api/attendance';
import { getMySchedule } from 'src/api/schedule';
import { useAuthContext } from 'src/auth/auth-context';
import type { IAttendanceLog, IAttendanceReport, IMyScheduleItem } from 'src/types/corecms-api';

dayjs.locale('vi');

type Coords = { latitude: number; longitude: number; accuracy?: number };
type GpsStatus = 'idle' | 'loading' | 'ready' | 'error';

type CheckInWindowStatus = 'too-early' | 'allowed' | 'too-late' | 'checked-in';

interface WindowInfo {
  status: CheckInWindowStatus;
  allowedFrom: dayjs.Dayjs;
  shiftEnd: dayjs.Dayjs;
  minutesUntil: number; // positive = time until allowed, negative = already past
}

function getCheckInWindow(shift: IMyScheduleItem, now: dayjs.Dayjs): WindowInfo {
  const allowedFrom = dayjs(`${shift.date} ${shift.startTime}`).subtract(shift.checkInAllowedMinutesBefore, 'minute');
  const shiftEnd = dayjs(`${shift.date} ${shift.endTime}`);
  const minutesUntil = allowedFrom.diff(now, 'minute');

  if (shift.hasCheckedIn) return { status: 'checked-in', allowedFrom, shiftEnd, minutesUntil };
  if (now.isBefore(allowedFrom)) return { status: 'too-early', allowedFrom, shiftEnd, minutesUntil };
  if (now.isAfter(shiftEnd)) return { status: 'too-late', allowedFrom, shiftEnd, minutesUntil };
  return { status: 'allowed', allowedFrom, shiftEnd, minutesUntil };
}

/** Returns the first shift the user can smart-check-in to right now (mirrors server logic). */
function getActiveCheckinShift(shifts: IMyScheduleItem[], now: dayjs.Dayjs): IMyScheduleItem | null {
  const sorted = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const shift of sorted) {
    const { status } = getCheckInWindow(shift, now);
    if (status === 'allowed') return shift;
  }
  return null;
}

/** Returns the next upcoming shift (too-early), for countdown display. */
function getNextUpcomingShift(shifts: IMyScheduleItem[], now: dayjs.Dayjs): IMyScheduleItem | null {
  const sorted = [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
  for (const shift of sorted) {
    const { status } = getCheckInWindow(shift, now);
    if (status === 'too-early') return shift;
  }
  return null;
}

function formatTime(iso?: string | null) {
  if (!iso) return '--:--';
  return dayjs(iso).format('HH:mm');
}

function formatCountdown(minutes: number): string {
  if (minutes <= 0) return '';
  if (minutes < 60) return `${minutes} phút`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h} giờ ${m} phút` : `${h} giờ`;
}

function ShiftCard({ shift, now }: { shift: IMyScheduleItem; now: dayjs.Dayjs }) {
  const window = getCheckInWindow(shift, now);

  const dotColor =
    window.status === 'allowed'   ? '#00A76F' :
    window.status === 'too-early' ? '#FFAB00' :
    window.status === 'checked-in'? '#00A76F' : '#C4CDD5';

  // Time-of-day chip
  const timeChip = {
    'too-early':  { label: 'Sắp tới',      color: '#B76E00', bg: '#FFF7E0' },
    'allowed':    { label: 'Đang mở',       color: '#00A76F', bg: '#E8F8F1' },
    'too-late':   { label: 'Đã qua',        color: '#919EAB', bg: '#F4F6F8' },
    'checked-in': { label: 'Đã check-in',   color: '#00A76F', bg: '#E8F8F1' },
  }[window.status];

  // Window hint line
  const windowHint = (() => {
    const fromStr = window.allowedFrom.format('HH:mm');
    const toStr = window.shiftEnd.format('HH:mm');
    if (window.status === 'too-early') {
      const countdown = formatCountdown(window.minutesUntil);
      return { text: `Check-in từ ${fromStr} → ${toStr}  (còn ${countdown})`, color: '#B76E00' };
    }
    if (window.status === 'allowed') {
      return { text: `✓ Có thể check-in đến ${toStr}`, color: '#00A76F' };
    }
    if (window.status === 'checked-in') {
      return { text: `Check-in lúc ${shift.checkInTime ? dayjs(shift.checkInTime).format('HH:mm') : '--'}`, color: '#637381' };
    }
    return { text: `Khung check-in: ${fromStr} → ${toStr}`, color: '#919EAB' };
  })();

  return (
    <View style={shiftStyles.row}>
      <View style={[shiftStyles.dot, { backgroundColor: dotColor }]} />
      <View style={shiftStyles.info}>
        <Text variant="titleSmall" style={{ fontWeight: '700' }}>{shift.shiftName}</Text>
        <Text variant="bodySmall" style={{ color: '#637381', marginTop: 1 }}>
          {shift.startTime} – {shift.endTime}  ·  {shift.totalHours}h
        </Text>
        <Text variant="bodySmall" style={{ color: windowHint.color, marginTop: 2, fontSize: 11 }}>
          {windowHint.text}
        </Text>
      </View>
      <Chip
        compact
        style={{ backgroundColor: timeChip.bg, height: 24, alignSelf: 'flex-start' }}
        textStyle={{ color: timeChip.color, fontSize: 10, fontWeight: '700' }}
      >
        {timeChip.label}
      </Chip>
    </View>
  );
}

const shiftStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  info: { flex: 1 },
});

// ── Main Component ──────────────────────────────────────────────────────────

export default function CheckInScreen() {
  const { user } = useAuthContext();
  const theme = useTheme();

  // Data
  const [logs, setLogs] = useState<IAttendanceLog[]>([]);
  const [activeLog, setActiveLog] = useState<IAttendanceLog | null>(null);
  const [shifts, setShifts] = useState<IMyScheduleItem[]>([]);
  const [report, setReport] = useState<IAttendanceReport | null>(null);

  // UI State
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [shiftExpanded, setShiftExpanded] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Live clock (updates every second for countdown)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Derived from shifts + clock — recalculated every second
  const nowDayjs = dayjs(now);
  const activeCheckinShift = getActiveCheckinShift(shifts, nowDayjs);
  const nextUpcomingShift = getNextUpcomingShift(shifts, nowDayjs);

  // Whether the check-in button should be enabled (not checked-in AND a shift is in window)
  const canCheckIn = !activeLog && activeCheckinShift !== null;

  // Human-readable reason when button is disabled
  const checkinDisabledReason = (() => {
    if (activeLog) return null; // showing checkout UI instead
    if (shifts.length === 0) return 'Không có ca làm việc hôm nay';
    if (activeCheckinShift) return null; // enabled
    if (nextUpcomingShift) {
      const { allowedFrom } = getCheckInWindow(nextUpcomingShift, nowDayjs);
      const countdown = formatCountdown(allowedFrom.diff(nowDayjs, 'minute'));
      return `Check-in mở lúc ${allowedFrom.format('HH:mm')} (còn ${countdown})`;
    }
    // All shifts checked-in or past
    const allCheckedIn = shifts.every(s => s.hasCheckedIn);
    if (allCheckedIn) return 'Đã check-in tất cả ca hôm nay';
    return 'Ngoài khung giờ check-in';
  })();

  // GPS
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle');
  const [checkInCoords, setCheckInCoords] = useState<Coords | null>(null);

  const insets = useSafeAreaInsets();

  // Camera
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [captureTime, setCaptureTime] = useState<Date>(new Date());
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const cameraRef = useRef<CameraView>(null);
  const previewRef = useRef<ViewShotRef>(null);

  // Pulse animation for active dot
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
    const [logsData, shiftsData, reportData] = await Promise.allSettled([
      getMyAttendanceLogs(today, today),
      getMySchedule(today, today),
      getMyAttendanceReport(monthStart, today),
    ]);
    if (logsData.status === 'fulfilled') {
      setLogs(logsData.value);
      // Fallback: find by status, or any log with checkInTime but no checkOutTime
      setActiveLog(
        logsData.value.find((l) => l.status === 'CheckedIn') ??
        logsData.value.find((l) => !!l.checkInTime && !l.checkOutTime) ??
        null
      );
    }
    if (shiftsData.status === 'fulfilled') setShifts(shiftsData.value);
    if (reportData.status === 'fulfilled') setReport(reportData.value);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  // ── GPS ──────────────────────────────────────────────────────────────────

  async function fetchGps(): Promise<Coords | null> {
    setGpsStatus('loading');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setGpsStatus('error'); return null; }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
      setCheckInCoords(coords);
      setGpsStatus('ready');
      return coords;
    } catch {
      setGpsStatus('error');
      return null;
    }
  }

  // ── Check-in flow ─────────────────────────────────────────────────────────

  async function openCheckInCamera() {
    let camGranted = cameraPermission?.granted;
    if (!camGranted) {
      const result = await requestCameraPermission();
      camGranted = result.granted;
    }
    if (!camGranted) {
      Alert.alert('Yêu cầu quyền Camera', 'CoreCMS cần quyền camera để xác thực khuôn mặt khi check-in.');
      return;
    }
    setLoading(true);
    const coords = await fetchGps();
    setLoading(false);
    if (!coords) {
      Alert.alert('Không lấy được GPS', 'Vui lòng bật GPS và cấp quyền vị trí, rồi thử lại.');
      return;
    }
    setCapturedUri(null);
    setCameraModalOpen(true);
  }

  async function handleCapture() {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo) throw new Error('No photo');
      setCapturedUri(photo.uri);
      setCaptureTime(new Date());
    } catch {
      Alert.alert('Lỗi', 'Không thể chụp ảnh. Vui lòng thử lại.');
    }
  }

  function extractApiError(err: any): string {
    if (typeof err === 'string') return err;
    if (err?.errors && typeof err.errors === 'object' && !Array.isArray(err.errors)) {
      const key = Object.keys(err.errors)[0];
      if (key) { const msgs = err.errors[key]; return Array.isArray(msgs) ? msgs[0] : String(msgs); }
    }
    return err?.detail || err?.description || err?.message
      || (err?.title !== 'One or more validation errors occurred.' ? err?.title : null)
      || 'Vui lòng thử lại';
  }

  async function handleConfirmCheckIn() {
    if (!capturedUri || !checkInCoords || !previewRef.current) return;
    setLoading(true);
    try {
      // 1. Create attendance log first — if this fails (no shift, outside geofence, etc.), abort before sending Telegram
      await smartCheckIn({ latitude: checkInCoords.latitude, longitude: checkInCoords.longitude, accuracy: checkInCoords.accuracy, faceVerified: true });
      // 2. Attendance log created successfully — capture photo and fire Telegram notification
      const base64 = await previewRef.current.capture();
      await checkinFace({
        candidateName: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'Unknown',
        imageBase64: `data:image/jpeg;base64,${base64}`,
        lat: checkInCoords.latitude,
        lng: checkInCoords.longitude,
        time: captureTime.toISOString(),
      });
      setCameraModalOpen(false);
      Alert.alert('✅ Thành công', 'Check-in thành công!');
      await loadAll();
    } catch (err: any) {
      Alert.alert('Check-in thất bại', extractApiError(err));
    } finally { setLoading(false); }
  }

  async function handleCheckOut() {
    Alert.alert('Xác nhận', 'Bạn có muốn check-out không?', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Check-out', style: 'destructive',
        onPress: async () => {
          setLoading(true);
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            let coords: Coords | null = null;
            if (status === 'granted') {
              const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
              coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracy: loc.coords.accuracy ?? undefined };
            }
            await smartCheckOut({ latitude: coords?.latitude, longitude: coords?.longitude, accuracy: coords?.accuracy });
            Alert.alert('✅ Thành công', 'Check-out thành công!');
            await loadAll();
          } catch (err: any) {
            Alert.alert('Check-out thất bại', extractApiError(err));
          } finally { setLoading(false); }
        },
      },
    ]);
  }

  // ── GPS chip ───────────────────────────────────────────────────────────────

  const gpsChipProps = {
    idle:    { icon: 'map-marker-outline',  label: 'Nhấn để lấy GPS',   color: '#637381', bg: '#F4F6F8' },
    loading: { icon: 'map-marker-radius',   label: 'Đang lấy GPS...',   color: '#FFAB00', bg: '#FFF7E0' },
    ready:   { icon: 'map-marker-check',    label: 'GPS sẵn sàng',      color: '#00A76F', bg: '#E8F8F1' },
    error:   { icon: 'map-marker-off',      label: 'Không lấy được GPS. Kiểm tra quyền trình duyệt.', color: '#FF5630', bg: '#FFF1EE' },
  }[gpsStatus];

  const isCheckedIn = !!activeLog;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {dayjs().format('dddd, DD/MM/YYYY')}
            </Text>
            <Text variant="titleLarge" style={{ fontWeight: 'bold', marginTop: 1 }}>
              Xin chào, {user?.firstName} 👋
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/notifications')} style={styles.notifBtn}>
            <MaterialCommunityIcons name="bell-outline" size={22} color={theme.colors.onSurface} />
          </TouchableOpacity>
        </View>

        {/* ── Main card ── */}
        <View style={styles.mainCard}>
          {isCheckedIn ? (
            /* CHECKED IN STATE */
            <View style={styles.cardInner}>
              <View style={styles.workingRow}>
                <Animated.View style={[styles.pulseDotOuter, { transform: [{ scale: pulseAnim }] }]}>
                  <View style={styles.pulseDotInner} />
                </Animated.View>
                <Text style={styles.workingLabel}>ĐANG LÀM VIỆC</Text>
              </View>
              <Text style={styles.clockText}>{formatTime(activeLog.checkInTime)}</Text>
              <Text style={styles.clockSub}>
                Check-in lúc {formatTime(activeLog.checkInTime)}
                {activeLog.isLate ? `  ·  Trễ ${activeLog.lateMinutes} phút` : '  ·  Đúng giờ'}
              </Text>
              <Button
                mode="contained"
                onPress={handleCheckOut}
                loading={loading}
                disabled={loading}
                buttonColor="#FF5630"
                style={styles.actionBtn}
                contentStyle={{ paddingVertical: 8 }}
                labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
                icon="logout"
              >
                Check-out
              </Button>
            </View>
          ) : (
            /* NOT CHECKED IN STATE */
            <View style={styles.cardInner}>
              <Text style={styles.readyLabel}>
                {canCheckIn ? 'SẴN SÀNG LÀM VIỆC' : 'CHƯA ĐẾN GIỜ CHECK-IN'}
              </Text>
              <Text style={styles.clockText}>
                {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </Text>
              {canCheckIn ? (
                <Text style={styles.clockSub}>
                  Ca {activeCheckinShift?.shiftName} · {activeCheckinShift?.startTime} – {activeCheckinShift?.endTime}{'\n'}
                  Đang trong khung giờ check-in ✓
                </Text>
              ) : (
                <Text style={[styles.clockSub, { color: 'rgba(255,255,255,0.5)' }]}>
                  {checkinDisabledReason ?? 'Hệ thống tự nhận diện ca phù hợp'}
                </Text>
              )}
              <Button
                mode="contained"
                onPress={openCheckInCamera}
                loading={loading}
                disabled={loading || !canCheckIn}
                buttonColor={canCheckIn ? '#00A76F' : '#455A64'}
                style={styles.actionBtn}
                contentStyle={{ paddingVertical: 8 }}
                labelStyle={{ fontSize: 16, fontWeight: 'bold' }}
                icon={canCheckIn ? 'camera-account' : 'clock-outline'}
              >
                {canCheckIn ? 'Chụp ảnh & Check-in' : 'Chưa đến giờ'}
              </Button>
            </View>
          )}
        </View>

        {/* ── Checkout card (visible only when checked in) ── */}
        {isCheckedIn && (
          <TouchableOpacity
            style={styles.checkoutCard}
            onPress={handleCheckOut}
            activeOpacity={0.8}
            disabled={loading}
          >
            <View style={styles.checkoutCardLeft}>
              <View style={styles.checkoutDot} />
              <View>
                <Text style={styles.checkoutTitle}>Đang làm việc</Text>
                <Text style={styles.checkoutSub}>
                  Từ {formatTime(activeLog?.checkInTime)}
                  {activeLog?.isLate ? `  ·  Trễ ${activeLog.lateMinutes} phút` : '  ·  Đúng giờ'}
                </Text>
              </View>
            </View>
            <View style={styles.checkoutBtn}>
              <MaterialCommunityIcons name="logout" size={18} color="#FF5630" />
              <Text style={styles.checkoutBtnText}>Check-out</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* GPS status */}
        <TouchableOpacity
          onPress={gpsStatus === 'idle' || gpsStatus === 'error' ? fetchGps : undefined}
          activeOpacity={0.75}
        >
          <View style={[styles.gpsChip, { backgroundColor: gpsChipProps.bg }]}>
            <MaterialCommunityIcons name={gpsChipProps.icon as any} size={16} color={gpsChipProps.color} />
            <Text style={[styles.gpsLabel, { color: gpsChipProps.color }]}>{gpsChipProps.label}</Text>
            {gpsStatus === 'ready' && checkInCoords && (
              <Text style={[styles.gpsCoords, { color: gpsChipProps.color }]}>
                {checkInCoords.latitude.toFixed(4)}, {checkInCoords.longitude.toFixed(4)}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* ── Shift schedule ── */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity
            onPress={() => setShiftExpanded(!shiftExpanded)}
            activeOpacity={0.8}
            style={styles.cardHeader}
          >
            <View style={styles.cardHeaderLeft}>
              <MaterialCommunityIcons name="calendar-clock" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall" style={{ fontWeight: '700', marginLeft: 8 }}>Lịch ca hôm nay</Text>
              {shifts.length > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.badgeText}>{shifts.length}</Text>
                </View>
              )}
            </View>
            <MaterialCommunityIcons
              name={shiftExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.colors.onSurfaceVariant}
            />
          </TouchableOpacity>
          {shiftExpanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              {shifts.length === 0 ? (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, paddingVertical: 12, textAlign: 'center' }}>
                  Không có ca làm việc hôm nay
                </Text>
              ) : (
                shifts.map((shift, i) => (
                  <View key={shift.assignmentId}>
                    {i > 0 && <Divider style={{ marginVertical: 2 }} />}
                    <ShiftCard shift={shift} now={nowDayjs} />
                  </View>
                ))
              )}
            </View>
          )}
        </Card>

        {/* ── Stats ── */}
        {report && (
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { backgroundColor: '#E8F8F1' }]}>
              <Text style={[styles.statNumber, { color: '#00A76F' }]}>{report.totalPresent}</Text>
              <Text style={[styles.statLabel, { color: '#637381' }]}>NGÀY CÔNG</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FFF7E0' }]}>
              <Text style={[styles.statNumber, { color: '#FFAB00' }]}>{report.totalAbsent}</Text>
              <Text style={[styles.statLabel, { color: '#637381' }]}>VẮNG MẶT</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: '#FFF1EE' }]}>
              <Text style={[styles.statNumber, { color: '#FF5630' }]}>{report.totalLate}</Text>
              <Text style={[styles.statLabel, { color: '#637381' }]}>ĐI TRỄ</Text>
            </View>
          </View>
        )}

        {/* ── Quick actions ── */}
        <View style={styles.quickGrid}>
          {[
            { icon: 'clipboard-text-outline', label: 'Yêu cầu\nđiều chỉnh', color: '#00B8D9', bg: '#E8F9FD', route: '/attendance' },
            { icon: 'calendar-remove-outline', label: 'Xin nghỉ\nphép', color: '#FFAB00', bg: '#FFF7E0', route: '/attendance/new' },
            { icon: 'calendar-plus', label: 'Đăng ký\nca', color: '#8E33FF', bg: '#F3E8FF', route: '/(tabs)/schedule/register' },
            { icon: 'chart-bar', label: 'Báo cáo\ncông', color: '#FF5630', bg: '#FFF1EE', route: '/(tabs)/payroll' },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={[styles.quickBtn, { backgroundColor: item.bg }]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
            >
              <MaterialCommunityIcons name={item.icon as any} size={24} color={item.color} />
              <Text style={[styles.quickLabel, { color: '#1C252E' }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Today's history ── */}
        <Card style={[styles.card, { backgroundColor: theme.colors.surface }]}>
          <TouchableOpacity
            onPress={() => setHistoryExpanded(!historyExpanded)}
            activeOpacity={0.8}
            style={styles.cardHeader}
          >
            <View style={styles.cardHeaderLeft}>
              <MaterialCommunityIcons name="history" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall" style={{ fontWeight: '700', marginLeft: 8 }}>Lịch sử hôm nay</Text>
              {logs.length > 0 && (
                <View style={[styles.badge, { backgroundColor: theme.colors.primary }]}>
                  <Text style={styles.badgeText}>{logs.length}</Text>
                </View>
              )}
            </View>
            <MaterialCommunityIcons
              name={historyExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.colors.onSurfaceVariant}
            />
          </TouchableOpacity>
          {historyExpanded && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {logs.length === 0 ? (
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, paddingVertical: 12, textAlign: 'center' }}>
                  Chưa có dữ liệu điểm danh hôm nay
                </Text>
              ) : (
                logs.map((log, i) => (
                  <View key={log.id}>
                    {i > 0 && <Divider style={{ marginVertical: 10 }} />}
                    <View style={styles.logRow}>
                      <View style={styles.logTime}>
                        <MaterialCommunityIcons name="login" size={14} color="#00A76F" />
                        <Text variant="labelMedium" style={{ color: '#637381' }}>IN</Text>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#00A76F' }}>{formatTime(log.checkInTime)}</Text>
                      </View>
                      <MaterialCommunityIcons name="arrow-right" size={18} color="#C4CDD5" />
                      <View style={styles.logTime}>
                        <MaterialCommunityIcons name="logout" size={14} color="#FF5630" />
                        <Text variant="labelMedium" style={{ color: '#637381' }}>OUT</Text>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold', color: '#FF5630' }}>{formatTime(log.checkOutTime)}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
                        {log.isLate ? (
                          <Chip key="late" compact style={{ backgroundColor: '#FFF7E0', height: 22 }} textStyle={{ color: '#FFAB00', fontSize: 10 }}>
                            Trễ {log.lateMinutes}p
                          </Chip>
                        ) : null}
                        {log.faceVerified ? (
                          <Chip key="face" compact icon="check-decagram" style={{ backgroundColor: '#E8F8F1', height: 22 }} textStyle={{ color: '#00A76F', fontSize: 10 }}>
                            Verified
                          </Chip>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* ── Face capture modal ── */}
      <Modal visible={cameraModalOpen} animationType="slide" statusBarTranslucent>
        <StatusBar barStyle="light-content" backgroundColor="#1C252E" />
        <View style={styles.modal}>
          <View style={[styles.modalTopBar, { paddingTop: insets.top }]}>
            <View style={styles.modalHeader}>
              <IconButton icon="close" iconColor="#fff" size={24} onPress={() => { setCameraModalOpen(false); setCapturedUri(null); }} />
              <Text variant="titleMedium" style={{ color: '#fff', fontWeight: 'bold', flex: 1, marginLeft: 4 }}>
                {capturedUri ? 'Xác nhận ảnh check-in' : 'Chụp khuôn mặt'}
              </Text>
              {!capturedUri && (
                <IconButton
                  icon="camera-flip"
                  iconColor="#fff"
                  size={24}
                  onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
                />
              )}
            </View>
          </View>

          <View style={{ flex: 1, backgroundColor: '#000' }}>
            {!capturedUri ? (
              <>
                <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
                <View style={styles.cameraOverlay}>
                  <Text style={styles.overlayText}>⏰ {dayjs(now).format('HH:mm  DD/MM/YYYY')}</Text>
                  {checkInCoords && (
                    <Text style={styles.overlayText}>📍 {checkInCoords.latitude.toFixed(5)}, {checkInCoords.longitude.toFixed(5)}</Text>
                  )}
                </View>
              </>
            ) : (
              <ViewShot
                ref={previewRef}
                style={StyleSheet.absoluteFill}
                options={{ format: 'jpg', quality: 0.85, result: 'base64' }}
              >
                <Image
                  source={{ uri: capturedUri }}
                  style={[StyleSheet.absoluteFill, facing === 'front' && { transform: [{ scaleX: -1 }] }]}
                  resizeMode="cover"
                />
                <View style={styles.cameraOverlay}>
                  <Text style={styles.overlayText}>⏰ {dayjs(captureTime).format('HH:mm  DD/MM/YYYY')}</Text>
                  <Text style={styles.overlayText}>
                    📍 {checkInCoords?.latitude.toFixed(5)}, {checkInCoords?.longitude.toFixed(5)}
                  </Text>
                </View>
              </ViewShot>
            )}
          </View>

          <SafeAreaView style={{ backgroundColor: '#1C252E' }} edges={['bottom']}>
            <View style={styles.modalActions}>
              {!capturedUri ? (
                <Button mode="contained" onPress={handleCapture} buttonColor="#fff" textColor="#1C252E"
                  contentStyle={{ paddingVertical: 10 }} labelStyle={{ fontSize: 16, fontWeight: 'bold' }} icon="camera">
                  Chụp ảnh
                </Button>
              ) : (
                <View style={{ gap: 12 }}>
                  <Button mode="outlined" onPress={() => { setCapturedUri(null); }}
                    textColor="#fff" style={{ borderColor: 'rgba(255,255,255,0.35)' }}
                    contentStyle={{ paddingVertical: 8 }} icon="camera-retake">
                    Chụp lại
                  </Button>
                  <Button mode="contained" onPress={handleConfirmCheckIn} loading={loading} disabled={loading}
                    buttonColor="#00A76F" contentStyle={{ paddingVertical: 10 }}
                    labelStyle={{ fontSize: 16, fontWeight: 'bold' }} icon="check-circle">
                    Xác nhận Check-in
                  </Button>
                </View>
              )}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const CARD_BG = '#1B2A6B';

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, gap: 14 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F4F6F8', justifyContent: 'center', alignItems: 'center' },

  // Main card
  mainCard: { borderRadius: 24, backgroundColor: CARD_BG, overflow: 'hidden' },
  cardInner: { padding: 28, alignItems: 'center', gap: 6 },
  workingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  pulseDotOuter: { width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(0,167,111,0.35)', justifyContent: 'center', alignItems: 'center' },
  pulseDotInner: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#00A76F' },
  workingLabel: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  readyLabel: { color: 'rgba(255,255,255,0.7)', fontWeight: '600', fontSize: 13, letterSpacing: 1, marginBottom: 4 },
  clockText: { color: '#fff', fontSize: 52, fontWeight: 'bold', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  clockSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  actionBtn: { marginTop: 16, borderRadius: 14, width: '100%', elevation: 0 },

  // Checkout card
  checkoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF1EE',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FFAC9A',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  checkoutCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  checkoutDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#00A76F' },
  checkoutTitle: { fontSize: 14, fontWeight: '700', color: '#1C252E' },
  checkoutSub: { fontSize: 12, color: '#637381', marginTop: 2 },
  checkoutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFE4DC' },
  checkoutBtnText: { color: '#FF5630', fontWeight: '700', fontSize: 13 },

  // GPS chip
  gpsChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  gpsLabel: { fontSize: 12, fontWeight: '600', flex: 1 },
  gpsCoords: { fontSize: 11, opacity: 0.7 },

  // Card
  card: { borderRadius: 16, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  badge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, marginLeft: 8 },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderRadius: 14, paddingVertical: 14, alignItems: 'center', gap: 4 },
  statNumber: { fontSize: 28, fontWeight: 'bold' },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  // Quick actions
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickBtn: { width: '47%', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 16, gap: 8 },
  quickLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', lineHeight: 15 },

  // Log history
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  logTime: { alignItems: 'center', gap: 2 },

  // Modal
  modal: { flex: 1, backgroundColor: '#000' },
  modalTopBar: { backgroundColor: '#1C252E' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', paddingRight: 16, paddingVertical: 4 },
  cameraOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 10, paddingHorizontal: 14, gap: 4 },
  overlayText: { color: '#fff', fontSize: 12 },
  modalActions: { padding: 20, paddingBottom: 24 },
});
