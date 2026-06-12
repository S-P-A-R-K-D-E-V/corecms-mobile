import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Alert,
} from 'react-native';
import {
  Text, Card, Button, Surface, useTheme, Divider, Snackbar,
  Portal, Dialog, TextInput, HelperText, ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs, { Dayjs } from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import { MaterialCommunityIcons } from '@expo/vector-icons';

dayjs.extend(isToday);

import { getMySchedule } from 'src/api/schedule';
import { getMyShiftRegistrations } from 'src/api/shiftRegistration';
import {
  getOpenPoolPosts, getMyPoolPosts, getMyClaims,
  createShiftPoolPost, claimShiftPoolPost, cancelShiftPoolPost, reviewShiftPoolPost,
} from 'src/api/shiftPool';
import type { IMyScheduleItem, IShiftRegistration, IShiftPoolPost, PoolNeedType, PoolPostStatus } from 'src/types/corecms-api';
import { useNotificationHub } from 'src/hooks/use-notification-hub';
import { useNotificationSettings } from 'src/hooks/use-notification-settings';
import { useAuthContext } from 'src/auth/auth-context';
import type { INotification } from 'src/api/notifications';

// ----------------------------------------------------------------------

const DAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const POOL_POSTED_COLOR = '#FF6F00';
const TENTATIVE_COLOR = '#7986cb';

const NEED_TYPE_LABEL: Record<PoolNeedType, string> = {
  Swap: 'Đổi ca',
  FullCover: 'Làm hộ cả ca',
  PartialCover: 'Làm hộ 1 phần',
};

const POOL_STATUS_LABEL: Record<PoolPostStatus, string> = {
  Open: 'Đang mở',
  WaitingApproval: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Cancelled: 'Đã huỷ',
};

const NEED_TYPE_COLOR: Record<PoolNeedType, string> = {
  Swap: '#2196F3',
  FullCover: '#9C27B0',
  PartialCover: '#FF9800',
};

const STATUS_HEX: Record<PoolPostStatus, string> = {
  Open: '#2196F3',
  WaitingApproval: '#FF9800',
  Approved: '#00A76F',
  Cancelled: '#637381',
};

const NEED_OPTIONS: { value: PoolNeedType; label: string; desc: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
  { value: 'FullCover', label: 'Làm hộ cả ca', desc: 'Nhờ người khác làm toàn bộ ca', icon: 'account-arrow-right-outline' },
  { value: 'PartialCover', label: 'Làm hộ một phần', desc: 'Chỉ nhờ làm một khoảng giờ', icon: 'clock-outline' },
  { value: 'Swap', label: 'Đổi ca', desc: 'Muốn đổi lấy ca của người nhận', icon: 'swap-horizontal' },
];

function fmtMoney(v?: number) {
  return v != null ? `${v.toLocaleString('vi-VN')}đ` : '';
}

// Lightweight badge — avoids Chip's "compact" prop / Fragment warning in RNP 5.15.x
function MiniChip({ label, color, style }: { label: string; color: string; style?: object }) {
  return (
    <View style={[{ backgroundColor: `${color}18`, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start' }, style]}>
      <Text style={{ color, fontSize: 11, fontWeight: '600', lineHeight: 16 }}>{label}</Text>
    </View>
  );
}

// ── Custom Calendar Strip ──────────────────────────────────────────────

function CalendarStrip({
  selectedDate,
  onSelectDate,
  markedDates,
  poolActiveDates,
}: {
  selectedDate: string;
  onSelectDate: (d: string) => void;
  markedDates: Set<string>;
  poolActiveDates?: Set<string>;
}) {
  const theme = useTheme();
  const [weekStart, setWeekStart] = useState<Dayjs>(
    dayjs(selectedDate).startOf('week')
  );

  const days = Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day'));

  return (
    <Card style={[styles.calCard, { backgroundColor: theme.colors.surface }]}>
      <View style={styles.monthRow}>
        <TouchableOpacity onPress={() => setWeekStart((w) => w.subtract(1, 'week'))} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.colors.primary, paddingHorizontal: 8 }}>‹</Text>
        </TouchableOpacity>
        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
          {weekStart.format('MMMM YYYY')}
        </Text>
        <TouchableOpacity onPress={() => setWeekStart((w) => w.add(1, 'week'))} hitSlop={12}>
          <Text style={{ fontSize: 22, color: theme.colors.primary, paddingHorizontal: 8 }}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.daysRow}>
        {days.map((day) => {
          const key = day.format('YYYY-MM-DD');
          const isSelected = key === selectedDate;
          const isTodayDate = day.isToday();
          const hasShift = markedDates.has(key);
          const hasPool = poolActiveDates?.has(key);

          return (
            <TouchableOpacity
              key={key}
              onPress={() => onSelectDate(key)}
              style={[
                styles.dayCell,
                isSelected && { backgroundColor: theme.colors.primary, borderRadius: 12 },
              ]}
              activeOpacity={0.7}
            >
              <Text
                variant="labelSmall"
                style={{
                  color: isSelected ? 'rgba(255,255,255,0.8)' : theme.colors.onSurfaceVariant,
                  marginBottom: 2,
                }}
              >
                {DAYS_SHORT[day.day()]}
              </Text>
              <Text
                variant="titleSmall"
                style={{
                  fontWeight: isSelected || isTodayDate ? 'bold' : '400',
                  color: isSelected ? '#fff' : isTodayDate ? theme.colors.primary : theme.colors.onSurface,
                }}
              >
                {day.format('D')}
              </Text>
              <View style={{ flexDirection: 'row', gap: 2, marginTop: 3, minHeight: 6 }}>
                {hasShift && (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: isSelected ? 'rgba(255,255,255,0.9)' : theme.colors.primary },
                    ]}
                  />
                )}
                {hasPool && (
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: isSelected ? 'rgba(255,255,255,0.7)' : POOL_POSTED_COLOR, width: 4, height: 4 },
                    ]}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        onPress={() => {
          const today = dayjs().format('YYYY-MM-DD');
          setWeekStart(dayjs().startOf('week'));
          onSelectDate(today);
        }}
        style={styles.todayBtn}
      >
        <Text variant="labelSmall" style={{ color: theme.colors.primary }}>Hôm nay</Text>
      </TouchableOpacity>
    </Card>
  );
}

// ── Layer Chips ────────────────────────────────────────────────────────

const LAYER_CHIPS: { key: 'personal' | 'open-pool' | 'my-claim'; label: string; color: string }[] = [
  { key: 'personal', label: 'Lịch của tôi', color: '#00B8D9' },
  { key: 'open-pool', label: 'Chợ ca', color: NEED_TYPE_COLOR.Swap },
  { key: 'my-claim', label: 'Ca chờ nhận', color: TENTATIVE_COLOR },
];

function LayerChips({
  visible,
  onToggle,
}: {
  visible: Set<'personal' | 'open-pool' | 'my-claim'>;
  onToggle: (key: 'personal' | 'open-pool' | 'my-claim') => void;
}) {
  return (
    <View style={styles.layerRow}>
      {LAYER_CHIPS.map((chip) => {
        const active = visible.has(chip.key);
        return (
          <TouchableOpacity
            key={chip.key}
            onPress={() => onToggle(chip.key)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.layerChip,
              {
                backgroundColor: active ? `${chip.color}18` : 'transparent',
                borderColor: active ? chip.color : '#e0e0e0',
              },
            ]}>
              <View style={[styles.layerDot, { backgroundColor: active ? chip.color : '#bdbdbd' }]} />
              <Text variant="labelSmall" style={{ color: active ? chip.color : '#9e9e9e', fontWeight: active ? '600' : '400' }}>
                {chip.label}
              </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Shift Cards ────────────────────────────────────────────────────────

function ShiftCard({ item, poolPost, onPress }: { item: IMyScheduleItem; poolPost?: IShiftPoolPost; onPress?: () => void }) {
  const theme = useTheme();
  const status = item.hasCheckedOut ? 'Hoàn thành' : item.hasCheckedIn ? 'Đang làm' : 'Đã xếp';
  const color = item.hasCheckedOut ? '#00A76F' : item.hasCheckedIn ? '#FFAB00' : '#00B8D9';
  const barColor = poolPost ? POOL_POSTED_COLOR : color;

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} disabled={!onPress}>
      <Surface style={[styles.shiftCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={[styles.shiftBar, { backgroundColor: barColor }]} />
        <View style={styles.shiftBody}>
          <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>{item.shiftName}</Text>
          <Text variant="bodySmall" style={{ color: '#637381' }}>{item.startTime} – {item.endTime}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
            <MiniChip label={status} color={color} />
            {poolPost && <MiniChip label={`🔄 ${NEED_TYPE_LABEL[poolPost.needType]}`} color={POOL_POSTED_COLOR} />}
          </View>
          {poolPost?.status === 'WaitingApproval' && poolPost.claimerName && (
            <Text variant="bodySmall" style={{ color: '#FF9800', marginTop: 4 }}>
              Người nhận: {poolPost.claimerName} · Chờ bạn duyệt
            </Text>
          )}
        </View>
        {onPress && (
          <View style={styles.cardChevron}>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#C4CDD5" />
          </View>
        )}
      </Surface>
    </TouchableOpacity>
  );
}

function RegCard({ item }: { item: IShiftRegistration }) {
  const theme = useTheme();
  const color = '#00B8D9';
  return (
    <Surface style={[styles.shiftCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={[styles.shiftBar, { backgroundColor: color }]} />
      <View style={styles.shiftBody}>
        <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>{item.shiftName}</Text>
        <Text variant="bodySmall" style={{ color: '#637381' }}>{item.startTime} – {item.endTime}</Text>
        <MiniChip label="Đã đăng ký" color={color} style={{ marginTop: 4 }} />
      </View>
    </Surface>
  );
}

function PoolOpenCard({ post, onPress }: { post: IShiftPoolPost; onPress: () => void }) {
  const theme = useTheme();
  const color = NEED_TYPE_COLOR[post.needType];
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress}>
      <Surface style={[styles.shiftCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={[styles.shiftBar, { backgroundColor: color }]} />
        <View style={styles.shiftBody}>
          <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
            {NEED_TYPE_LABEL[post.needType]} · {post.shiftName}
          </Text>
          <Text variant="bodySmall" style={{ color: '#637381' }}>
            {post.shiftStartTime} – {post.shiftEndTime} · {post.posterName}
          </Text>
          {post.needType === 'PartialCover' && post.partialStartTime && (
            <Text variant="bodySmall" style={{ color: '#637381' }}>
              Làm hộ: {post.partialStartTime} – {post.partialEndTime}
            </Text>
          )}
          {!!post.extraPayAmount && (
            <Text variant="bodySmall" style={{ color: '#00A76F', marginTop: 2, fontWeight: '600' }}>
              Phụ cấp: {fmtMoney(post.extraPayAmount)}
            </Text>
          )}
          <MiniChip label="Nhấn để nhận" color={color} style={{ marginTop: 4 }} />
        </View>
        <View style={styles.cardChevron}>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#C4CDD5" />
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

function PoolClaimCard({ post, onPress }: { post: IShiftPoolPost; onPress: () => void }) {
  const color = TENTATIVE_COLOR;
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress}>
      <Surface
        style={[styles.shiftCard, { backgroundColor: `${color}08`, borderWidth: 1, borderColor: `${color}55`, borderStyle: 'dashed' }]}
        elevation={0}
      >
        <View style={[styles.shiftBar, { backgroundColor: color }]} />
        <View style={styles.shiftBody}>
          <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
            ⏳ {NEED_TYPE_LABEL[post.needType]} · {post.shiftName}
          </Text>
          <Text variant="bodySmall" style={{ color: '#637381' }}>
            {post.shiftStartTime} – {post.shiftEndTime} · Người đăng: {post.posterName}
          </Text>
          <MiniChip label="Chờ duyệt" color={color} style={{ marginTop: 4 }} />
        </View>
        <View style={styles.cardChevron}>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#C4CDD5" />
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

function HistoryCard({ role, post, onPress }: { role: 'poster' | 'claimer'; post: IShiftPoolPost; onPress: () => void }) {
  const theme = useTheme();
  const color = STATUS_HEX[post.status];
  const isPoster = role === 'poster';

  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress}>
      <Surface style={[styles.shiftCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={[styles.shiftBar, { backgroundColor: color }]} />
        <View style={styles.shiftBody}>
          <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>
            {NEED_TYPE_LABEL[post.needType]} · {post.shiftName}
          </Text>
          <Text variant="bodySmall" style={{ color: '#637381' }}>
            {dayjs(post.shiftDate).format('DD/MM/YYYY')} ·{' '}
            {isPoster
              ? (post.claimerName ? `Người nhận: ${post.claimerName}` : 'Chưa có người nhận')
              : `Người đăng: ${post.posterName}`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <MiniChip label={POOL_STATUS_LABEL[post.status]} color={color} />
            <MiniChip label={isPoster ? 'Bài đăng' : 'Tôi nhận'} color="#637381" />
          </View>
          {!!post.extraPayAmount && (
            <Text variant="bodySmall" style={{ color: '#00A76F', marginTop: 4, fontWeight: '600' }}>
              Phụ cấp: {fmtMoney(post.extraPayAmount)}
            </Text>
          )}
          {post.reviewNote && (
            <Text variant="bodySmall" style={{ color: '#9EA3AE', marginTop: 2 }}>
              Phản hồi: {post.reviewNote}
            </Text>
          )}
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const theme = useTheme();
  const { user } = useAuthContext();
  const { prefs } = useNotificationSettings();
  const [selectedDate, setSelectedDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [assignments, setAssignments] = useState<IMyScheduleItem[]>([]);
  const [registrations, setRegistrations] = useState<IShiftRegistration[]>([]);
  const [openPoolPosts, setOpenPoolPosts] = useState<IShiftPoolPost[]>([]);
  const [myPoolPosts, setMyPoolPosts] = useState<IShiftPoolPost[]>([]);
  const [myClaims, setMyClaims] = useState<IShiftPoolPost[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [visibleLayers, setVisibleLayers] = useState<Set<'personal' | 'open-pool' | 'my-claim'>>(
    new Set(['personal', 'my-claim'])
  );
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });

  // ── Dialog state ──
  const [postTarget, setPostTarget] = useState<IMyScheduleItem | null>(null);
  const [postNeedType, setPostNeedType] = useState<PoolNeedType>('FullCover');
  const [partialStart, setPartialStart] = useState('');
  const [partialEnd, setPartialEnd] = useState('');
  const [postNote, setPostNote] = useState('');
  const [postErrors, setPostErrors] = useState<Record<string, string>>({});

  const [managePost, setManagePost] = useState<IShiftPoolPost | null>(null);
  const [claimTarget, setClaimTarget] = useState<IShiftPoolPost | null>(null);
  const [offeredId, setOfferedId] = useState('');
  const [detailTarget, setDetailTarget] = useState<IShiftPoolPost | null>(null);
  const [busy, setBusy] = useState(false);

  const startOfRange = dayjs(selectedDate).subtract(1, 'month').startOf('month').format('YYYY-MM-DD');
  const endOfRange = dayjs(selectedDate).add(1, 'month').endOf('month').format('YYYY-MM-DD');

  const loadData = useCallback(async () => {
    try {
      const [sched, regs, openPosts, myPosts, claims] = await Promise.all([
        getMySchedule(startOfRange, endOfRange),
        getMyShiftRegistrations(startOfRange, endOfRange),
        getOpenPoolPosts().catch(() => [] as IShiftPoolPost[]),
        getMyPoolPosts().catch(() => [] as IShiftPoolPost[]),
        getMyClaims().catch(() => [] as IShiftPoolPost[]),
      ]);
      setAssignments(sched);
      setRegistrations(regs);
      setOpenPoolPosts(openPosts.filter((p) => p.posterId !== user?.id));
      setMyPoolPosts(myPosts);
      setMyClaims(claims);
    } catch {}
  }, [startOfRange, endOfRange, user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time refresh when Shift notification arrives (vibration handled by hub)
  useNotificationHub({
    preferences: prefs,
    onNewNotification: useCallback((n: INotification) => {
      const isShift = n.category === 'Shift' || n.type === 'Shift';
      if (!isShift) return;
      setSnackbar({ visible: true, message: `${n.title}${n.body ? `\n${n.body}` : ''}` });
      loadData();
    }, [loadData]),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const toggleLayer = useCallback((key: 'personal' | 'open-pool' | 'my-claim') => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }, []);

  // Map shiftAssignmentId → active pool post (Open | WaitingApproval)
  const postedMap = useMemo(
    () => new Map(
      myPoolPosts
        .filter((p) => p.status === 'Open' || p.status === 'WaitingApproval')
        .map((p) => [p.shiftAssignmentId, p])
    ),
    [myPoolPosts]
  );

  const markedDates = useMemo(() => new Set<string>([
    ...assignments.map((a) => a.date),
    ...registrations.map((r) => r.date),
  ]), [assignments, registrations]);

  const poolActiveDates = useMemo(() => new Set<string>([
    ...myPoolPosts.filter((p) => p.status === 'Open' || p.status === 'WaitingApproval').map((p) => p.shiftDate),
    ...myClaims.filter((p) => p.status === 'WaitingApproval').map((p) => p.shiftDate),
    ...openPoolPosts.map((p) => p.shiftDate),
  ]), [myPoolPosts, myClaims, openPoolPosts]);

  const dayAssignments = useMemo(
    () => assignments.filter((a) => a.date === selectedDate),
    [assignments, selectedDate]
  );
  const dayRegistrations = useMemo(
    () => registrations.filter((r) => r.date === selectedDate),
    [registrations, selectedDate]
  );
  const dayOpenPosts = useMemo(
    () => openPoolPosts.filter((p) => p.shiftDate === selectedDate),
    [openPoolPosts, selectedDate]
  );
  const dayMyClaims = useMemo(
    () => myClaims.filter((p) => p.shiftDate === selectedDate && p.status === 'WaitingApproval'),
    [myClaims, selectedDate]
  );

  const historyItems = useMemo(() => [
    ...myPoolPosts.map((p) => ({ role: 'poster' as const, post: p })),
    ...myClaims.map((p) => ({ role: 'claimer' as const, post: p })),
  ].sort((a, b) => b.post.shiftDate.localeCompare(a.post.shiftDate)).slice(0, 30),
  [myPoolPosts, myClaims]);

  // My upcoming shifts available as a "đổi lại" (offered) shift for Swap claims
  const offerableShifts = useMemo(() => {
    if (!claimTarget) return [];
    return assignments.filter((a) =>
      !a.hasCheckedIn &&
      a.assignmentId !== claimTarget.shiftAssignmentId &&
      dayjs(`${a.date}T${(a.startTime || '00:00').slice(0, 5)}`).isAfter(dayjs())
    );
  }, [assignments, claimTarget]);

  // ── Action helpers ──
  const runAction = useCallback(async (fn: () => Promise<unknown>, successMsg: string, onDone: () => void) => {
    setBusy(true);
    try {
      await fn();
      onDone();
      await loadData();
      if (successMsg) setSnackbar({ visible: true, message: successMsg });
    } catch (err: any) {
      Alert.alert('Lỗi', err?.title || err?.message || 'Thao tác thất bại. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }, [loadData]);

  // Open the post / manage dialog for a personal shift
  const onPressPersonal = useCallback((item: IMyScheduleItem) => {
    const existing = postedMap.get(item.assignmentId);
    if (existing) {
      setManagePost(existing);
      return;
    }
    // Default need type based on whether shift already started
    const started = !dayjs(`${item.date}T${(item.startTime || '00:00').slice(0, 5)}`).isAfter(dayjs());
    setPostTarget(item);
    setPostNeedType(started ? 'PartialCover' : 'FullCover');
    setPartialStart('');
    setPartialEnd('');
    setPostNote('');
    setPostErrors({});
  }, [postedMap]);

  const closePostDialog = useCallback(() => { setPostTarget(null); }, []);

  const shiftStarted = useMemo(
    () => postTarget ? !dayjs(`${postTarget.date}T${(postTarget.startTime || '00:00').slice(0, 5)}`).isAfter(dayjs()) : false,
    [postTarget]
  );

  const handleSubmitPost = useCallback(() => {
    if (!postTarget) return;
    const e: Record<string, string> = {};
    if (postNeedType !== 'PartialCover' && shiftStarted) {
      e.type = 'Ca đã bắt đầu — chỉ có thể đăng "Làm hộ một phần".';
    }
    if (postNeedType === 'PartialCover') {
      if (!/^\d{2}:\d{2}$/.test(partialStart)) e.partialStart = 'Giờ bắt đầu không hợp lệ (HH:mm)';
      if (!/^\d{2}:\d{2}$/.test(partialEnd)) e.partialEnd = 'Giờ kết thúc không hợp lệ (HH:mm)';
      if (!e.partialStart && !e.partialEnd && partialStart >= partialEnd) {
        e.partialEnd = 'Giờ kết thúc phải sau giờ bắt đầu';
      }
    }
    setPostErrors(e);
    if (Object.keys(e).length > 0) return;

    runAction(
      () => createShiftPoolPost({
        shiftAssignmentId: postTarget.assignmentId,
        needType: postNeedType,
        partialStartTime: postNeedType === 'PartialCover' ? partialStart : undefined,
        partialEndTime: postNeedType === 'PartialCover' ? partialEnd : undefined,
        note: postNote.trim() || undefined,
      }),
      'Đã đăng ca lên chợ. Khi có người nhận, bạn sẽ xác nhận lại.',
      closePostDialog
    );
  }, [postTarget, postNeedType, shiftStarted, partialStart, partialEnd, postNote, runAction, closePostDialog]);

  // Manage my post: cancel (Open) or review (WaitingApproval)
  const handleCancelPost = useCallback(() => {
    if (!managePost) return;
    runAction(() => cancelShiftPoolPost(managePost.id), 'Đã huỷ bài đăng.', () => setManagePost(null));
  }, [managePost, runAction]);

  const handleReviewPost = useCallback((action: 'Approve' | 'RejectClaim') => {
    if (!managePost) return;
    runAction(
      () => reviewShiftPoolPost(managePost.id, { action }),
      action === 'Approve' ? 'Đã xác nhận đổi ca / làm hộ!' : 'Đã từ chối người nhận. Bài đăng mở lại.',
      () => setManagePost(null)
    );
  }, [managePost, runAction]);

  // Claim an open post
  const openClaimDialog = useCallback((post: IShiftPoolPost) => {
    setClaimTarget(post);
    setOfferedId('');
  }, []);

  const handleSubmitClaim = useCallback(() => {
    if (!claimTarget) return;
    if (claimTarget.needType === 'Swap' && !offeredId) {
      Alert.alert('Chọn ca đổi lại', 'Với đổi ca, bạn cần chọn một ca của mình để đưa lại cho người đăng.');
      return;
    }
    runAction(
      () => claimShiftPoolPost(claimTarget.id, claimTarget.needType === 'Swap' ? { offeredAssignmentId: offeredId } : {}),
      'Đã nhận ca. Chờ người đăng xác nhận.',
      () => setClaimTarget(null)
    );
  }, [claimTarget, offeredId, runAction]);

  const hasPoolToday = dayOpenPosts.length > 0 || dayMyClaims.length > 0;
  const showEmpty = dayAssignments.length === 0 && dayRegistrations.length === 0 && !hasPoolToday;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
      >
        <CalendarStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          markedDates={markedDates}
          poolActiveDates={poolActiveDates}
        />

        <LayerChips visible={visibleLayers} onToggle={toggleLayer} />

        <View style={styles.registerRow}>
          <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>
            {dayjs(selectedDate).format('DD/MM/YYYY')}
          </Text>
          <Button
            mode="contained" compact icon="plus"
            onPress={() => router.push({ pathname: '/(tabs)/schedule/register', params: { date: selectedDate } })}
            style={{ borderRadius: 10 }}
          >
            Đăng ký ca
          </Button>
        </View>

        <View style={styles.daySection}>
          {/* Personal assignments — clickable to post/manage pool */}
          {visibleLayers.has('personal') && dayAssignments.length > 0 && (
            <>
              <Text variant="labelMedium" style={styles.sectionLabel}>CA ĐƯỢC XẾP · nhấn để đổi ca / làm hộ</Text>
              {dayAssignments.map((a) => (
                <ShiftCard
                  key={a.assignmentId}
                  item={a}
                  poolPost={postedMap.get(a.assignmentId)}
                  onPress={a.hasCheckedOut ? undefined : () => onPressPersonal(a)}
                />
              ))}
            </>
          )}

          {/* Open pool posts */}
          {visibleLayers.has('open-pool') && dayOpenPosts.length > 0 && (
            <>
              {(visibleLayers.has('personal') && dayAssignments.length > 0) && (
                <Divider style={{ marginVertical: 12 }} />
              )}
              <Text variant="labelMedium" style={styles.sectionLabel}>CHỢ CA · nhấn để nhận</Text>
              {dayOpenPosts.map((p) => <PoolOpenCard key={p.id} post={p} onPress={() => openClaimDialog(p)} />)}
            </>
          )}

          {/* My waiting claims */}
          {visibleLayers.has('my-claim') && dayMyClaims.length > 0 && (
            <>
              {(dayAssignments.length > 0 || dayOpenPosts.length > 0) && (
                <Divider style={{ marginVertical: 12 }} />
              )}
              <Text variant="labelMedium" style={styles.sectionLabel}>CA TÔI CHỜ NHẬN</Text>
              {dayMyClaims.map((p) => <PoolClaimCard key={p.id} post={p} onPress={() => setDetailTarget(p)} />)}
            </>
          )}

          {/* Registrations */}
          {dayRegistrations.length > 0 && (
            <>
              {(dayAssignments.length > 0 || dayOpenPosts.length > 0 || dayMyClaims.length > 0) && (
                <Divider style={{ marginVertical: 12 }} />
              )}
              <Text variant="labelMedium" style={styles.sectionLabel}>CA ĐÃ ĐĂNG KÝ</Text>
              {dayRegistrations.map((r) => <RegCard key={r.id} item={r} />)}
            </>
          )}

          {showEmpty && (
            <View style={styles.empty}>
              <Text style={{ fontSize: 36 }}>📅</Text>
              <Text variant="bodyMedium" style={{ color: '#637381', marginTop: 8 }}>Không có ca làm việc ngày này</Text>
            </View>
          )}
        </View>

        {/* Pool History */}
        {historyItems.length > 0 && (
          <View style={styles.historySection}>
            <Divider style={{ marginBottom: 16 }} />
            <Text variant="labelMedium" style={[styles.sectionLabel, { paddingHorizontal: 16 }]}>
              LỊCH SỬ ĐĂNG / NHẬN CA
            </Text>
            <View style={{ paddingHorizontal: 16, gap: 8 }}>
              {historyItems.map(({ role, post }) => (
                <HistoryCard key={`${role}-${post.id}`} role={role} post={post} onPress={() => setDetailTarget(post)} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ════════════════ DIALOGS ════════════════ */}
      <Portal>
        {/* Post to pool dialog */}
        <Dialog visible={!!postTarget} onDismiss={closePostDialog} style={styles.dialog}>
          <Dialog.Title>Đăng ca lên chợ</Dialog.Title>
          {postTarget && (
            <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }} keyboardShouldPersistTaps="handled">
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                  {postTarget.shiftName} · {postTarget.startTime} – {postTarget.endTime}
                </Text>
                <Text variant="bodySmall" style={{ color: '#637381', marginBottom: 12 }}>
                  {dayjs(postTarget.date).format('dddd, DD/MM/YYYY')}
                </Text>

                <Text variant="labelLarge" style={{ marginBottom: 8 }}>Bạn cần gì?</Text>
                <View style={{ gap: 8 }}>
                  {NEED_OPTIONS.map((opt) => {
                    const disabled = opt.value !== 'PartialCover' && shiftStarted;
                    const active = postNeedType === opt.value;
                    const c = NEED_TYPE_COLOR[opt.value];
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        disabled={disabled}
                        activeOpacity={0.75}
                        onPress={() => { setPostNeedType(opt.value); setPostErrors((p) => ({ ...p, type: '' })); }}
                        style={[
                          styles.optRow,
                          {
                            opacity: disabled ? 0.4 : 1,
                            backgroundColor: active ? `${c}14` : theme.colors.surface,
                            borderColor: active ? c : theme.colors.outline,
                            borderWidth: active ? 2 : 1,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons name={opt.icon} size={24} color={active ? c : '#637381'} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text variant="bodyMedium" style={{ fontWeight: active ? '700' : '500', color: active ? c : theme.colors.onSurface }}>
                            {opt.label}
                          </Text>
                          <Text variant="labelSmall" style={{ color: '#9EA3AE' }}>{opt.desc}</Text>
                        </View>
                        {active && <MaterialCommunityIcons name="check-circle" size={20} color={c} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {!!postErrors.type && <HelperText type="error">{postErrors.type}</HelperText>}

                {postNeedType === 'PartialCover' && (
                  <View style={{ marginTop: 12 }}>
                    <Text variant="labelLarge" style={{ marginBottom: 4 }}>Khoảng giờ cần làm hộ</Text>
                    <Text variant="labelSmall" style={{ color: '#9EA3AE', marginBottom: 8 }}>
                      Trong ca: {postTarget.startTime} – {postTarget.endTime}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          mode="outlined" dense label="Từ (HH:mm)" value={partialStart}
                          onChangeText={(v) => { setPartialStart(v); setPostErrors((p) => ({ ...p, partialStart: '' })); }}
                          placeholder="18:00" keyboardType="numbers-and-punctuation" error={!!postErrors.partialStart}
                        />
                        {!!postErrors.partialStart && <HelperText type="error">{postErrors.partialStart}</HelperText>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <TextInput
                          mode="outlined" dense label="Đến (HH:mm)" value={partialEnd}
                          onChangeText={(v) => { setPartialEnd(v); setPostErrors((p) => ({ ...p, partialEnd: '' })); }}
                          placeholder="22:00" keyboardType="numbers-and-punctuation" error={!!postErrors.partialEnd}
                        />
                        {!!postErrors.partialEnd && <HelperText type="error">{postErrors.partialEnd}</HelperText>}
                      </View>
                    </View>
                  </View>
                )}

                <TextInput
                  mode="outlined" label="Ghi chú (không bắt buộc)" value={postNote} onChangeText={setPostNote}
                  multiline numberOfLines={2} maxLength={500} style={{ marginTop: 12 }}
                  placeholder="VD: Mình bận đột xuất, ai nhận giúp với..."
                />
              </ScrollView>
            </Dialog.ScrollArea>
          )}
          <Dialog.Actions>
            <Button onPress={closePostDialog} disabled={busy}>Huỷ</Button>
            <Button mode="contained" onPress={handleSubmitPost} loading={busy} disabled={busy} icon="bullhorn-outline">
              Đăng lên chợ
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Manage my post dialog */}
        <Dialog visible={!!managePost} onDismiss={() => setManagePost(null)} style={styles.dialog}>
          <Dialog.Title>Bài đăng của tôi</Dialog.Title>
          {managePost && (
            <Dialog.Content>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                {NEED_TYPE_LABEL[managePost.needType]} · {managePost.shiftName}
              </Text>
              <Text variant="bodySmall" style={{ color: '#637381', marginTop: 2 }}>
                {dayjs(managePost.shiftDate).format('dddd, DD/MM/YYYY')} · {managePost.shiftStartTime} – {managePost.shiftEndTime}
              </Text>
              <MiniChip label={POOL_STATUS_LABEL[managePost.status]} color={STATUS_HEX[managePost.status]} style={{ marginTop: 8 }} />
              {!!managePost.claimerName && (
                <Text variant="bodySmall" style={{ color: '#1C252E', marginTop: 10 }}>
                  Người nhận: <Text style={{ fontWeight: '700' }}>{managePost.claimerName}</Text>
                  {managePost.claimerOfferedShiftName
                    ? ` · đề nghị đổi: ${managePost.claimerOfferedShiftName}${managePost.claimerOfferedShiftDate ? ` (${dayjs(managePost.claimerOfferedShiftDate).format('DD/MM')})` : ''}`
                    : ''}
                </Text>
              )}
              {managePost.status === 'WaitingApproval' && (
                <Text variant="labelSmall" style={{ color: '#9EA3AE', marginTop: 8 }}>
                  Xác nhận để hoàn tất đổi ca / làm hộ với người nhận, hoặc từ chối để mở lại bài đăng.
                </Text>
              )}
            </Dialog.Content>
          )}
          <Dialog.Actions>
            <Button onPress={() => setManagePost(null)} disabled={busy}>Đóng</Button>
            {managePost?.status === 'Open' && (
              <Button textColor="#FF5630" onPress={handleCancelPost} loading={busy} disabled={busy}>
                Huỷ bài đăng
              </Button>
            )}
            {managePost?.status === 'WaitingApproval' && (
              <>
                <Button textColor="#FF5630" onPress={() => handleReviewPost('RejectClaim')} disabled={busy}>
                  Từ chối
                </Button>
                <Button mode="contained" onPress={() => handleReviewPost('Approve')} loading={busy} disabled={busy}>
                  Xác nhận
                </Button>
              </>
            )}
          </Dialog.Actions>
        </Dialog>

        {/* Claim open post dialog */}
        <Dialog visible={!!claimTarget} onDismiss={() => setClaimTarget(null)} style={styles.dialog}>
          <Dialog.Title>{claimTarget ? `Nhận ${claimTarget.needType === 'Swap' ? 'đổi ca' : 'làm hộ'}` : ''}</Dialog.Title>
          {claimTarget && (
            <Dialog.ScrollArea style={{ paddingHorizontal: 0 }}>
              <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingVertical: 8 }}>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                  {claimTarget.shiftName} · {claimTarget.shiftStartTime} – {claimTarget.shiftEndTime}
                </Text>
                <Text variant="bodySmall" style={{ color: '#637381', marginTop: 2 }}>
                  {dayjs(claimTarget.shiftDate).format('dddd, DD/MM/YYYY')} · Người đăng: {claimTarget.posterName}
                </Text>
                {claimTarget.needType === 'PartialCover' && claimTarget.partialStartTime && (
                  <Text variant="bodySmall" style={{ color: '#637381', marginTop: 2 }}>
                    Khoảng làm hộ: {claimTarget.partialStartTime} – {claimTarget.partialEndTime}
                  </Text>
                )}
                {!!claimTarget.extraPayAmount && (
                  <Text variant="bodySmall" style={{ color: '#00A76F', marginTop: 4, fontWeight: '700' }}>
                    Phụ cấp làm hộ: {fmtMoney(claimTarget.extraPayAmount)}
                    {claimTarget.coveringHours ? ` (${claimTarget.coveringHours}h)` : ''}
                  </Text>
                )}
                {!!claimTarget.note && (
                  <Text variant="bodySmall" style={{ color: '#637381', marginTop: 6 }}>Ghi chú: {claimTarget.note}</Text>
                )}

                {claimTarget.needType === 'Swap' && (
                  <View style={{ marginTop: 14 }}>
                    <Text variant="labelLarge" style={{ marginBottom: 8 }}>Chọn ca của bạn để đổi lại</Text>
                    {offerableShifts.length === 0 ? (
                      <Text variant="bodySmall" style={{ color: '#FF5630' }}>
                        Bạn không có ca sắp tới nào để đổi lại.
                      </Text>
                    ) : (
                      <View style={{ gap: 8 }}>
                        {offerableShifts.map((s) => {
                          const active = offeredId === s.assignmentId;
                          return (
                            <TouchableOpacity
                              key={s.assignmentId}
                              activeOpacity={0.75}
                              onPress={() => setOfferedId(s.assignmentId)}
                              style={[
                                styles.optRow,
                                {
                                  backgroundColor: active ? `${theme.colors.primary}12` : theme.colors.surface,
                                  borderColor: active ? theme.colors.primary : theme.colors.outline,
                                  borderWidth: active ? 2 : 1,
                                },
                              ]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                                  {s.shiftName} ({s.startTime} – {s.endTime})
                                </Text>
                                <Text variant="labelSmall" style={{ color: '#637381' }}>
                                  {dayjs(s.date).format('dddd, DD/MM/YYYY')}
                                </Text>
                              </View>
                              {active && <MaterialCommunityIcons name="check-circle" size={20} color={theme.colors.primary} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </ScrollView>
            </Dialog.ScrollArea>
          )}
          <Dialog.Actions>
            <Button onPress={() => setClaimTarget(null)} disabled={busy}>Huỷ</Button>
            <Button
              mode="contained"
              onPress={handleSubmitClaim}
              loading={busy}
              disabled={busy || (claimTarget?.needType === 'Swap' && offerableShifts.length === 0)}
              icon="hand-back-right-outline"
            >
              {claimTarget?.needType === 'Swap' ? 'Đổi ca' : 'Nhận làm hộ'}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Read-only detail dialog (my claims / history) */}
        <Dialog visible={!!detailTarget} onDismiss={() => setDetailTarget(null)} style={styles.dialog}>
          <Dialog.Title>Chi tiết ca</Dialog.Title>
          {detailTarget && (
            <Dialog.Content>
              <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                {NEED_TYPE_LABEL[detailTarget.needType]} · {detailTarget.shiftName}
              </Text>
              <Text variant="bodySmall" style={{ color: '#637381', marginTop: 2 }}>
                {dayjs(detailTarget.shiftDate).format('dddd, DD/MM/YYYY')} · {detailTarget.shiftStartTime} – {detailTarget.shiftEndTime}
              </Text>
              <Text variant="bodySmall" style={{ color: '#637381', marginTop: 4 }}>
                Người đăng: {detailTarget.posterName}
              </Text>
              {detailTarget.needType === 'PartialCover' && detailTarget.partialStartTime && (
                <Text variant="bodySmall" style={{ color: '#637381', marginTop: 2 }}>
                  Khoảng làm hộ: {detailTarget.partialStartTime} – {detailTarget.partialEndTime}
                </Text>
              )}
              {!!detailTarget.extraPayAmount && (
                <Text variant="bodySmall" style={{ color: '#00A76F', marginTop: 4, fontWeight: '700' }}>
                  Phụ cấp: {fmtMoney(detailTarget.extraPayAmount)}
                  {detailTarget.coveringHours ? ` (${detailTarget.coveringHours}h)` : ''}
                </Text>
              )}
              <MiniChip label={POOL_STATUS_LABEL[detailTarget.status]} color={STATUS_HEX[detailTarget.status]} style={{ marginTop: 8 }} />
              {!!detailTarget.reviewNote && (
                <Text variant="bodySmall" style={{ color: '#637381', marginTop: 8 }}>
                  Phản hồi: {detailTarget.reviewNote}
                </Text>
              )}
            </Dialog.Content>
          )}
          <Dialog.Actions>
            <Button onPress={() => setDetailTarget(null)}>Đóng</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={5000}
        style={styles.snackbar}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  calCard: { margin: 16, borderRadius: 16, paddingVertical: 12, elevation: 1 },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8 },
  daysRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4 },
  dayCell: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, minWidth: 40 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  todayBtn: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingTop: 8 },

  layerRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  layerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  layerDot: { width: 7, height: 7, borderRadius: 4 },

  registerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 12,
  },
  sectionLabel: { color: '#637381', marginBottom: 8 },
  daySection: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  shiftCard: { flexDirection: 'row', borderRadius: 12, marginBottom: 4, alignItems: 'center' },
  shiftBar: { width: 5, alignSelf: 'stretch', borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  shiftBody: { flex: 1, padding: 12 },
  cardChevron: { paddingRight: 8, justifyContent: 'center' },
  empty: { alignItems: 'center', paddingVertical: 32 },

  historySection: { paddingBottom: 32 },
  snackbar: { marginBottom: 8 },

  dialog: { maxHeight: '85%' },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
  },
});
