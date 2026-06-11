import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, Vibration,
} from 'react-native';
import { Text, Card, Chip, Button, Surface, useTheme, Divider, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs, { Dayjs } from 'dayjs';
import isToday from 'dayjs/plugin/isToday';

dayjs.extend(isToday);

import { getMySchedule } from 'src/api/schedule';
import { getMyShiftRegistrations } from 'src/api/shiftRegistration';
import { getOpenPoolPosts, getMyPoolPosts, getMyClaims } from 'src/api/shiftPool';
import type { IMyScheduleItem, IShiftRegistration, IShiftPoolPost, PoolNeedType, PoolPostStatus } from 'src/types/corecms-api';
import { useNotificationHub } from 'src/hooks/use-notification-hub';
import type { INotification } from 'src/api/notifications';

// ----------------------------------------------------------------------

const DAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const POOL_POSTED_COLOR = '#FF6F00';
const TENTATIVE_COLOR = '#7986cb';

const NEED_TYPE_LABEL: Record<PoolNeedType, string> = {
  Swap: 'Đổi ca',
  FullCover: 'Làm hộ',
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

function ShiftCard({ item, poolPost }: { item: IMyScheduleItem; poolPost?: IShiftPoolPost }) {
  const theme = useTheme();
  const status = item.hasCheckedOut ? 'Hoàn thành' : item.hasCheckedIn ? 'Đang làm' : 'Đã xếp';
  const color = item.hasCheckedOut ? '#00A76F' : item.hasCheckedIn ? '#FFAB00' : '#00B8D9';
  const barColor = poolPost ? POOL_POSTED_COLOR : color;

  return (
    <Surface style={[styles.shiftCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={[styles.shiftBar, { backgroundColor: barColor }]} />
      <View style={styles.shiftBody}>
        <Text variant="titleSmall" style={{ fontWeight: 'bold' }}>{item.shiftName}</Text>
        <Text variant="bodySmall" style={{ color: '#637381' }}>{item.startTime} – {item.endTime}</Text>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <Chip compact style={{ backgroundColor: `${color}18`, alignSelf: 'flex-start' }}
            textStyle={{ color, fontSize: 11, fontWeight: '600' }}>
            {status}
          </Chip>
          {poolPost && (
            <Chip compact style={{ backgroundColor: `${POOL_POSTED_COLOR}18`, alignSelf: 'flex-start' }}
              textStyle={{ color: POOL_POSTED_COLOR, fontSize: 11, fontWeight: '600' }}>
              🔄 {NEED_TYPE_LABEL[poolPost.needType]}
            </Chip>
          )}
        </View>
        {poolPost?.status === 'WaitingApproval' && poolPost.claimerName && (
          <Text variant="bodySmall" style={{ color: '#FF9800', marginTop: 4 }}>
            Người nhận: {poolPost.claimerName} · Chờ duyệt
          </Text>
        )}
      </View>
    </Surface>
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
        <Chip compact style={{ backgroundColor: `${color}18`, alignSelf: 'flex-start', marginTop: 4 }}
          textStyle={{ color, fontSize: 11, fontWeight: '600' }}>
          Đã đăng ký
        </Chip>
      </View>
    </Surface>
  );
}

function PoolOpenCard({ post }: { post: IShiftPoolPost }) {
  const theme = useTheme();
  const color = NEED_TYPE_COLOR[post.needType];
  return (
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
            Phụ cấp: {post.extraPayAmount.toLocaleString('vi-VN')}đ
          </Text>
        )}
        <Chip compact style={{ backgroundColor: `${color}18`, alignSelf: 'flex-start', marginTop: 4 }}
          textStyle={{ color, fontSize: 11, fontWeight: '600' }}>
          Chờ người nhận
        </Chip>
      </View>
    </Surface>
  );
}

function PoolClaimCard({ post }: { post: IShiftPoolPost }) {
  const theme = useTheme();
  const color = TENTATIVE_COLOR;
  return (
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
        <Chip compact style={{ backgroundColor: `${color}18`, alignSelf: 'flex-start', marginTop: 4 }}
          textStyle={{ color, fontSize: 11, fontWeight: '600' }}>
          Chờ duyệt
        </Chip>
      </View>
    </Surface>
  );
}

function HistoryCard({ role, post }: { role: 'poster' | 'claimer'; post: IShiftPoolPost }) {
  const theme = useTheme();
  const color = STATUS_HEX[post.status];
  const isPoster = role === 'poster';

  return (
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
          <Chip compact style={{ backgroundColor: `${color}18`, alignSelf: 'flex-start' }}
            textStyle={{ color, fontSize: 10, fontWeight: '600' }}>
            {POOL_STATUS_LABEL[post.status]}
          </Chip>
          <Chip compact style={{ backgroundColor: '#63738118', alignSelf: 'flex-start' }}
            textStyle={{ color: '#637381', fontSize: 10 }}>
            {isPoster ? 'Bài đăng' : 'Tôi nhận'}
          </Chip>
        </View>
        {!!post.extraPayAmount && (
          <Text variant="bodySmall" style={{ color: '#00A76F', marginTop: 4, fontWeight: '600' }}>
            Phụ cấp: {post.extraPayAmount.toLocaleString('vi-VN')}đ
          </Text>
        )}
        {post.reviewNote && (
          <Text variant="bodySmall" style={{ color: '#9EA3AE', marginTop: 2 }}>
            Phản hồi: {post.reviewNote}
          </Text>
        )}
      </View>
    </Surface>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const theme = useTheme();
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
      setOpenPoolPosts(openPosts);
      setMyPoolPosts(myPosts);
      setMyClaims(claims);
    } catch {}
  }, [startOfRange, endOfRange]);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time refresh when Shift notification arrives
  useNotificationHub({
    onNewNotification: useCallback((n: INotification) => {
      const isShift = n.category === 'Shift' || n.type === 'Shift';
      if (!isShift) return;
      Vibration.vibrate([0, 80, 40, 80]);
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

  // Dates with active pool activity (open posts OR waiting claims)
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

  // History: all my pool transactions (poster + claimer), sorted by date desc
  const historyItems = useMemo(() => [
    ...myPoolPosts.map((p) => ({ role: 'poster' as const, post: p })),
    ...myClaims.map((p) => ({ role: 'claimer' as const, post: p })),
  ].sort((a, b) => b.post.shiftDate.localeCompare(a.post.shiftDate)).slice(0, 30),
  [myPoolPosts, myClaims]);

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

        {/* Layer visibility chips */}
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
          {/* Personal assignments */}
          {visibleLayers.has('personal') && dayAssignments.length > 0 && (
            <>
              <Text variant="labelMedium" style={styles.sectionLabel}>CA ĐƯỢC XẾP</Text>
              {dayAssignments.map((a) => (
                <ShiftCard key={a.assignmentId} item={a} poolPost={postedMap.get(a.assignmentId)} />
              ))}
            </>
          )}

          {/* Open pool posts */}
          {visibleLayers.has('open-pool') && dayOpenPosts.length > 0 && (
            <>
              {(visibleLayers.has('personal') && dayAssignments.length > 0) && (
                <Divider style={{ marginVertical: 12 }} />
              )}
              <Text variant="labelMedium" style={styles.sectionLabel}>CHỢ CA</Text>
              {dayOpenPosts.map((p) => <PoolOpenCard key={p.id} post={p} />)}
            </>
          )}

          {/* My waiting claims */}
          {visibleLayers.has('my-claim') && dayMyClaims.length > 0 && (
            <>
              {(dayAssignments.length > 0 || dayOpenPosts.length > 0) && (
                <Divider style={{ marginVertical: 12 }} />
              )}
              <Text variant="labelMedium" style={styles.sectionLabel}>CA TÔI CHỜ NHẬN</Text>
              {dayMyClaims.map((p) => <PoolClaimCard key={p.id} post={p} />)}
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
                <HistoryCard key={`${role}-${post.id}`} role={role} post={post} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

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
  shiftCard: { flexDirection: 'row', borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
  shiftBar: { width: 5 },
  shiftBody: { flex: 1, padding: 12 },
  empty: { alignItems: 'center', paddingVertical: 32 },

  historySection: { paddingBottom: 32 },
  snackbar: { marginBottom: 8 },
});
