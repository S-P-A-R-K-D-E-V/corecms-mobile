import { useMemo, useState, useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import isToday from 'dayjs/plugin/isToday';

import { Screen, Sheet, SectionCard } from 'src/components/shared';
import { Text, Button, Badge, Icon, Pressable, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import {
  createShiftPoolPost, claimShiftPoolPost, cancelShiftPoolPost, reviewShiftPoolPost,
} from 'src/api/shiftPool';
import { extractApiError } from 'src/services/error';
import { rescheduleShiftReminders } from 'src/services/shift-reminders';
import { useNotificationSettings } from 'src/hooks/use-notification-settings';
import { t } from 'src/i18n';
import type { IMyScheduleItem, IShiftRegistration, IShiftPoolPost, PoolNeedType, PartialCoverSide } from 'src/types/corecms-api';

import { CalendarStrip } from './CalendarStrip';
import { useScheduleData } from './hooks';
import { NEED_TYPE_LABEL, POOL_STATUS_LABEL, POOL_STATUS_TONE, NEED_OPTIONS, fmtMoney } from './constants';

dayjs.extend(isBetween);
dayjs.extend(isToday);

// ── Dot color per state ──────────────────────────────────────────────────────
// Khớp ngữ nghĩa màu của core-fe: xám = chưa chấm công, xanh dương = đã check-in,
// cam = đi muộn, xanh lá = hoàn thành.
type EventTone = 'done' | 'working' | 'late' | 'scheduled' | 'pool' | 'claim' | 'reg';
const DOT_CLS: Record<EventTone, string> = {
  done:      'bg-success',
  working:   'bg-info',
  late:      'bg-warning',
  scheduled: 'bg-faint',
  pool:      'bg-info border border-info',
  claim:     'border-2 border-secondary bg-transparent',
  reg:       'bg-ink/25 dark:bg-white/30',
};
const DOT_OUTLINE: Record<EventTone, boolean> = {
  done: false, working: false, late: false, scheduled: false, pool: true, claim: true, reg: false,
};

const ACCENT: Record<EventTone, string> = {
  done: brand.success, working: brand.info, late: brand.warning, scheduled: brand.faint,
  pool: brand.info, claim: brand.secondary, reg: brand.faint,
};

// Đi muộn = giờ check-in (giờ VN, "yyyy-MM-dd HH:mm:ss") trễ hơn giờ bắt đầu ca.
function isLateShift(a: IMyScheduleItem): boolean {
  if (!a.hasCheckedIn || !a.checkInTime || !a.startTime) return false;
  const scheduled = dayjs(`${a.date}T${a.startTime}`);
  const actual = dayjs(a.checkInTime.replace(' ', 'T'));
  return actual.isValid() && scheduled.isValid() && actual.isAfter(scheduled);
}

function shiftTone(item: IMyScheduleItem): EventTone {
  if (item.hasCheckedOut) return 'done';
  if (item.hasCheckedIn) return isLateShift(item) ? 'late' : 'working';
  return 'scheduled';
}

// Giờ "HH:mm" từ chuỗi BE "yyyy-MM-dd HH:mm:ss".
function timePart(s?: string): string | null {
  if (!s) return null;
  const part = s.includes(' ') ? s.split(' ')[1] : s;
  return part?.slice(0, 5) || null;
}

// Hai khoảng giờ "HH:mm" có giao nhau không (so sánh chuỗi đủ dùng trong ngày).
function timeOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Phụ đề ca được phân: giờ check-in/out (nếu có) + trạng thái chợ ca.
function assignmentSub(a: IMyScheduleItem, pool?: IShiftPoolPost): string | undefined {
  const parts: string[] = [];
  const tin = timePart(a.checkInTime);
  const tout = timePart(a.checkOutTime);
  if (tin) parts.push(`Vào ${tin}`);
  if (tout) parts.push(`Ra ${tout}`);
  if (pool?.status === 'WaitingApproval' && pool.claimerName) parts.push(`Người nhận: ${pool.claimerName} · Chờ duyệt`);
  else if (pool) parts.push(NEED_TYPE_LABEL[pool.needType]);
  return parts.length ? parts.join(' · ') : undefined;
}

// ── Mini số liệu tuần & chú thích màu (giống core-fe) ────────────────────────
function WeekMetric({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View className="items-center" style={{ minWidth: 56 }}>
      <Text className="text-2xl font-bold" style={{ color, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text variant="caption" tone="muted" className="text-center">{label}</Text>
    </View>
  );
}

function LegendDot({ color, label, outline }: { color: string; label: string; outline?: boolean }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <View
        style={{
          width: 10, height: 10, borderRadius: 5,
          backgroundColor: outline ? 'transparent' : color,
          borderWidth: outline ? 2 : 0, borderColor: color,
        }}
      />
      <Text variant="caption" tone="muted">{label}</Text>
    </View>
  );
}

// ── Single agenda event row ──────────────────────────────────────────────────

function AgendaRow({
  start, end, tone, label, sub, onPress,
}: {
  start: string; end: string;
  tone: EventTone;
  label: string;
  sub?: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      className="flex flex-row justify-between items-center gap-3 py-2.5 pl-2.5 pr-1 rounded-xl active:bg-ink/5 dark:active:bg-white/5"
      style={{ borderLeftWidth: 3, borderLeftColor: ACCENT[tone] }}
    >
      {/* Time range */}
      <Text
        className="text-[12px] text-muted font-medium"
        style={{ width: 110 }}
        numberOfLines={1}
      >
        {start} – {end}
      </Text>

      {/* Status dot */}
      <View className={cn('w-2.5 h-2.5 rounded-full', DOT_CLS[tone])} />

      {/* Name + sub-label */}
      <View className="flex-1">
        <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text className="text-[11px] text-muted" numberOfLines={1}>{sub}</Text>
        ) : null}
      </View>

      {onPress ? <Icon name="chevron-right" size={16} tone="faint" /> : null}
    </Pressable>
  );
}

// ── Single agenda day section ────────────────────────────────────────────────
function AgendaDay({
  day, assignments, registrations, openPosts, myClaims, layers, postedMap,
  onPressShift, onPressPool, onPressManage,
}: {
  day: dayjs.Dayjs;
  assignments: IMyScheduleItem[];
  registrations: IShiftRegistration[];
  openPosts: IShiftPoolPost[];
  myClaims: IShiftPoolPost[];
  layers: Set<string>;
  postedMap: Map<string, IShiftPoolPost>;
  onPressShift: (a: IMyScheduleItem) => void;
  onPressPool: (p: IShiftPoolPost) => void;
  onPressManage: (p: IShiftPoolPost) => void;
}) {
  const key = day.format('YYYY-MM-DD');
  const today = (day as any).isToday() as boolean;

  const dayAssignments = layers.has('personal') ? assignments.filter((a) => a.date === key) : [];
  const dayOpenPosts   = layers.has('open-pool') ? openPosts.filter((p) => p.shiftDate === key) : [];
  const dayClaims      = layers.has('my-claim')
    ? myClaims.filter((p) => p.shiftDate === key && p.status === 'WaitingApproval')
    : [];
  // Gộp lịch đăng ký với ca được phân: nếu một ca đăng ký trùng ca đã được phân
  // (cùng shiftSchedule hoặc trùng giờ) thì bỏ dòng đăng ký — ca được phân đã đại diện.
  const dayRegs = layers.has('registration')
    ? registrations
        .filter((r) => r.date === key)
        .filter((r) => !dayAssignments.some(
          (a) => a.shiftScheduleId === r.shiftScheduleId || timeOverlap(a.startTime, a.endTime, r.startTime, r.endTime),
        ))
    : [];

  const allRows = [
    ...dayAssignments.map((a) => ({
      key: a.assignmentId,
      start: a.startTime,
      end: a.endTime,
      tone: shiftTone(a) as EventTone,
      label: a.shiftName,
      sub: assignmentSub(a, postedMap.get(a.assignmentId)),
      onPress: !a.hasCheckedOut ? () => onPressShift(a) : undefined,
    })),
    ...dayOpenPosts.map((p) => ({
      key: p.id,
      start: p.shiftStartTime,
      end: p.shiftEndTime,
      tone: 'pool' as EventTone,
      label: `${NEED_TYPE_LABEL[p.needType]} · ${p.shiftName}`,
      sub: p.posterName + (p.extraPayAmount ? ` · ${fmtMoney(p.extraPayAmount)}` : ''),
      onPress: () => onPressPool(p),
    })),
    ...dayClaims.map((p) => ({
      key: `claim-${p.id}`,
      start: p.shiftStartTime,
      end: p.shiftEndTime,
      tone: 'claim' as EventTone,
      label: `${NEED_TYPE_LABEL[p.needType]} · ${p.shiftName}`,
      sub: `Người đăng: ${p.posterName} · Chờ duyệt`,
      onPress: () => onPressManage(p),
    })),
    ...dayRegs.map((r) => ({
      key: `reg-${r.id}`,
      start: r.startTime,
      end: r.endTime,
      tone: 'reg' as EventTone,
      label: r.shiftName,
      sub: 'Đã đăng ký',
      onPress: undefined,
    })),
  ];

  return (
    <View>
      {/* Date header — web style: day-name | hairline | date string */}
      <View className="flex-row items-center gap-2.5 pt-4 pb-2">
        <Text
          className={cn(
            'text-[13px] font-bold capitalize',
            today ? 'text-primary' : 'text-ink dark:text-ink-dark',
          )}
        >
          {day.format('dddd')}
        </Text>
        <View className="flex-1 h-px bg-line dark:bg-line-dark" />
        <Text className={cn('text-[12px]', today ? 'text-primary font-semibold' : 'text-muted')}>
          {day.format('D MMMM, YYYY')}
        </Text>
      </View>

      {/* Events */}
      {allRows.length === 0 ? (
        <View className="pl-[104px] py-2">
          <Text className="text-[12px] text-faint italic">Không có ca</Text>
        </View>
      ) : (
        allRows.map((row, i) => (
          <View key={row.key}>
            {i > 0 ? <View className="h-px bg-line/50 dark:bg-line-dark/50 ml-[104px]" /> : null}
            <AgendaRow
              start={row.start}
              end={row.end}
              tone={row.tone}
              label={row.label}
              sub={row.sub}
              onPress={row.onPress}
            />
          </View>
        ))
      )}
    </View>
  );
}

// ── Layer chips ───────────────────────────────────────────────────────────────
const LAYERS: { key: 'personal' | 'open-pool' | 'my-claim' | 'registration'; label: string }[] = [
  { key: 'personal',     label: 'Lịch của tôi' },
  { key: 'open-pool',    label: 'Chợ ca' },
  { key: 'my-claim',     label: 'Ca chờ duyệt' },
  { key: 'registration', label: 'Lịch đăng ký' },
];

// ── Main screen ───────────────────────────────────────────────────────────────
export function ScheduleScreen() {
  const { user } = useAuthContext();

  const [weekStart, setWeekStart] = useState(dayjs().startOf('week'));
  // Mục tiêu chính là lịch được phân công — các lớp phụ (Chợ ca/Ca chờ duyệt/Lịch đăng ký) mặc định ẩn
  const [layers, setLayers]  = useState<Set<string>>(new Set(['personal']));

  const { assignments, registrations, openPosts, myPosts, myClaims, refreshing, refetch } =
    useScheduleData(weekStart.format('YYYY-MM-DD'));

  // Nhắc trước 30p khi sắp đến ca — đặt lại local notification mỗi khi lịch đổi.
  const { prefs } = useNotificationSettings();
  const reminderOn = prefs.globalEnabled && prefs.categories.Shift && prefs.shiftReminderEnabled;
  useEffect(() => {
    rescheduleShiftReminders(assignments, reminderOn);
  }, [assignments, reminderOn]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')),
    [weekStart],
  );

  const weekKeys = useMemo(() => new Set(weekDays.map((d) => d.format('YYYY-MM-DD'))), [weekDays]);
  const weekStats = useMemo(() => {
    const wa = assignments.filter((a) => weekKeys.has(a.date));
    return {
      total: wa.length,
      checkedIn: wa.filter((a) => a.hasCheckedIn).length,
      done: wa.filter((a) => a.hasCheckedIn && a.hasCheckedOut).length,
      late: wa.filter(isLateShift).length,
      pending: wa.filter((a) => !a.hasCheckedIn).length,
    };
  }, [assignments, weekKeys]);

  const markedDates = useMemo(
    () => new Set<string>([...assignments.map((a) => a.date), ...registrations.map((r) => r.date)]),
    [assignments, registrations],
  );
  const poolDates = useMemo(
    () =>
      new Set<string>([
        ...openPosts.map((p) => p.shiftDate),
        ...myClaims.filter((p) => p.status === 'WaitingApproval').map((p) => p.shiftDate),
      ]),
    [openPosts, myClaims],
  );

  const postedMap = useMemo(
    () =>
      new Map(
        myPosts
          .filter((p) => p.status === 'Open' || p.status === 'WaitingApproval')
          .map((p) => [p.shiftAssignmentId, p]),
      ),
    [myPosts],
  );

  // Sheets
  const [postTarget, setPostTarget] = useState<IMyScheduleItem | null>(null);
  const [needType, setNeedType]     = useState<PoolNeedType>('FullCover');
  const [partialSide, setPartialSide] = useState<PartialCoverSide>('LateArrive');
  const [claimTarget, setClaimTarget] = useState<IShiftPoolPost | null>(null);
  const [offeredId, setOfferedId]   = useState('');
  const [managePost, setManagePost] = useState<IShiftPoolPost | null>(null);
  const [busy, setBusy] = useState(false);

  const offerableShifts = useMemo(() => {
    if (!claimTarget) return [];
    return assignments.filter(
      (a) =>
        !a.hasCheckedIn &&
        a.assignmentId !== claimTarget.shiftAssignmentId &&
        dayjs(`${a.date}T${(a.startTime || '00:00').slice(0, 5)}`).isAfter(dayjs()),
    );
  }, [assignments, claimTarget]);

  const runAction = useCallback(
    async (fn: () => Promise<unknown>, onDone: () => void) => {
      setBusy(true);
      try { await fn(); onDone(); await refetch(); }
      catch (err: any) { toast.error(extractApiError(err)); }
      finally { setBusy(false); }
    },
    [refetch],
  );

  function openPostSheet(item: IMyScheduleItem) {
    const existing = postedMap.get(item.assignmentId);
    if (existing) { setManagePost(existing); return; }
    const started = !dayjs(`${item.date}T${(item.startTime || '00:00').slice(0, 5)}`).isAfter(dayjs());
    setPostTarget(item);
    setNeedType(started ? 'PartialCover' : 'FullCover');
    setPartialSide('LateArrive');
  }

  const toggleLayer = (key: string) =>
    setLayers((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refetch}>
      {/* Week strip */}
      <CalendarStrip
        weekStart={weekStart}
        onWeekChange={setWeekStart}
        markedDates={markedDates}
        poolDates={poolDates}
      />

      {/* Controls: layers + single register button */}
      <View className="flex-row items-center gap-2 flex-wrap">
        <View className="flex-row gap-2 flex-1 flex-wrap">
          {LAYERS.map((l) => {
            const active = layers.has(l.key);
            return (
              <Pressable
                key={l.key}
                onPress={() => toggleLayer(l.key)}
                className={cn(
                  'flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border',
                  active
                    ? 'border-primary bg-primary/10'
                    : 'border-line dark:border-line-dark',
                )}
              >
                <View className={cn('w-2 h-2 rounded-full', active ? 'bg-primary' : 'bg-faint')} />
                <Text
                  variant="caption"
                  className={cn('font-semibold', active ? 'text-primary' : 'text-faint')}
                >
                  {l.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        
      </View>
      {/* Single register button for the whole week */}
      <View className="flex-row gap-2" style={{ marginTop: 4 }}>
        <Button
          size="sm"
          icon="plus"
          onPress={() =>
            router.push({
              pathname: '/shift-register',
              params: { date: weekStart.format('YYYY-MM-DD') },
            } as any)
          }
        >
          Đăng ký ca
        </Button>
        <Button size="sm" variant="outline" icon="broom" onPress={() => router.push('/cleaning' as any)}>
          Checklist vệ sinh
        </Button>
      </View>
      {/* 7-day agenda */}
      <View>
        {weekDays.map((day) => (
          <AgendaDay
            key={day.format('YYYY-MM-DD')}
            day={day}
            assignments={assignments}
            registrations={registrations}
            openPosts={openPosts}
            myClaims={myClaims}
            layers={layers}
            postedMap={postedMap}
            onPressShift={openPostSheet}
            onPressPool={(p) => { setClaimTarget(p); setOfferedId(''); }}
            onPressManage={setManagePost}
          />
        ))}
      </View>

      {/* ── Tổng quan tuần này + chú thích màu (giống core-fe) ── */}
      {weekStats.total > 0 ? (
        <SectionCard title="Tổng quan tuần này" icon="calendar-check">
          <View className="flex-row flex-wrap justify-between gap-y-3">
            <WeekMetric value={weekStats.total} label="Tổng ca" color={brand.primary} />
            <WeekMetric value={weekStats.checkedIn} label="Đã check-in" color={brand.info} />
            <WeekMetric value={weekStats.done} label="Hoàn thành" color={brand.success} />
            <WeekMetric value={weekStats.late} label="Đi muộn" color={brand.warning} />
            <WeekMetric value={weekStats.pending} label="Chưa chấm công" color={brand.faint} />
          </View>

          <Divider className="my-3" />

          <Text variant="caption" tone="muted" className="font-semibold mb-2">Chú thích màu</Text>
          <View className="flex-row flex-wrap gap-x-4 gap-y-2">
            <LegendDot color={brand.faint} label="Chưa chấm công" />
            <LegendDot color={brand.info} label="Đã check-in" />
            <LegendDot color={brand.warning} label="Đi muộn" />
            <LegendDot color={brand.success} label="Hoàn thành" />
            <LegendDot color={brand.info} label="Chợ ca" outline />
            <LegendDot color={brand.secondary} label="Ca chờ duyệt" outline />
            <LegendDot color={brand.faint} label="Đã đăng ký" />
          </View>
        </SectionCard>
      ) : null}

      {/* ── Post-to-pool sheet ── */}
      <Sheet
        visible={!!postTarget}
        title="Đăng ca lên chợ"
        onClose={() => setPostTarget(null)}
        footer={
          <Button
            loading={busy}
            icon="bullhorn-outline"
            onPress={() =>
              postTarget &&
              runAction(
                () => createShiftPoolPost({
                  shiftAssignmentId: postTarget.assignmentId,
                  needType,
                  partialSide: needType === 'PartialCover' ? partialSide : undefined,
                }),
                () => setPostTarget(null),
              )
            }
          >
            Đăng lên chợ
          </Button>
        }
      >
        {postTarget ? (
          <View className="gap-3">
            <View>
              <Text variant="subtitle">{postTarget.shiftName} · {postTarget.startTime} – {postTarget.endTime}</Text>
              <Text variant="bodySmall" tone="muted">{dayjs(postTarget.date).format('dddd, DD/MM/YYYY')}</Text>
            </View>
            <Text variant="label" tone="muted">Bạn cần gì?</Text>
            {NEED_OPTIONS.map((opt) => {
              const active = needType === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => setNeedType(opt.value)}
                  className={cn('flex-row items-center gap-3 p-3 rounded-xl border', active ? 'border-primary border-2 bg-primary/10' : 'border-line dark:border-line-dark')}
                >
                  <Icon name={opt.icon} size={24} tone={active ? 'primary' : 'muted'} />
                  <View className="flex-1">
                    <Text className={cn('font-semibold', active && 'text-primary')}>{opt.label}</Text>
                    <Text variant="caption" tone="faint">{opt.desc}</Text>
                  </View>
                  {active ? <Icon name="check-circle" size={20} tone="primary" /> : null}
                </Pressable>
              );
            })}
            {needType === 'PartialCover' ? (
              <View className="gap-2">
                <Text variant="label" tone="muted">Phần cần làm hộ</Text>
                {([['LateArrive', 'Đầu ca (tôi đến trễ)'], ['EarlyLeave', 'Cuối ca (tôi về sớm)']] as [PartialCoverSide, string][]).map(([side, label]) => (
                  <Pressable
                    key={side}
                    onPress={() => setPartialSide(side)}
                    className={cn('flex-row items-center gap-2 p-3 rounded-xl border', partialSide === side ? 'border-primary border-2 bg-primary/10' : 'border-line dark:border-line-dark')}
                  >
                    <Icon name={side === 'LateArrive' ? 'clock-start' : 'clock-end'} size={20} tone={partialSide === side ? 'primary' : 'muted'} />
                    <Text className={cn('flex-1', partialSide === side && 'text-primary font-semibold')}>{label}</Text>
                    {partialSide === side ? <Icon name="check-circle" size={18} tone="primary" /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      {/* ── Claim sheet ── */}
      <Sheet
        visible={!!claimTarget}
        title={claimTarget ? `Nhận ${claimTarget.needType === 'Swap' ? 'đổi ca' : 'làm hộ'}` : ''}
        onClose={() => setClaimTarget(null)}
        footer={
          <Button
            loading={busy}
            disabled={claimTarget?.needType === 'Swap' && offerableShifts.length === 0}
            icon="hand-back-right-outline"
            onPress={() => {
              if (!claimTarget) return;
              if (claimTarget.needType === 'Swap' && !offeredId) {
                toast.warning('Với đổi ca, hãy chọn một ca của bạn để đưa lại.', 'Chọn ca đổi lại');
                return;
              }
              runAction(
                () => claimShiftPoolPost(claimTarget.id, claimTarget.needType === 'Swap' ? { offeredAssignmentId: offeredId } : {}),
                () => setClaimTarget(null),
              );
            }}
          >
            {claimTarget?.needType === 'Swap' ? 'Đổi ca' : 'Nhận làm hộ'}
          </Button>
        }
      >
        {claimTarget ? (
          <View className="gap-2">
            <Text variant="subtitle">{claimTarget.shiftName} · {claimTarget.shiftStartTime} – {claimTarget.shiftEndTime}</Text>
            <Text variant="bodySmall" tone="muted">{dayjs(claimTarget.shiftDate).format('dddd, DD/MM/YYYY')} · Người đăng: {claimTarget.posterName}</Text>
            {claimTarget.extraPayAmount ? <Text variant="bodySmall" tone="primary" className="font-semibold">Phụ cấp: {fmtMoney(claimTarget.extraPayAmount)}{claimTarget.coveringHours ? ` (${claimTarget.coveringHours}h)` : ''}</Text> : null}
            {claimTarget.note ? <Text variant="bodySmall" tone="muted">Ghi chú: {claimTarget.note}</Text> : null}
            {claimTarget.needType === 'Swap' ? (
              <View className="gap-2 mt-2">
                <Text variant="label" tone="muted">Chọn ca của bạn để đổi lại</Text>
                {offerableShifts.length === 0 ? (
                  <Text variant="bodySmall" tone="error">Bạn không có ca sắp tới nào để đổi lại.</Text>
                ) : offerableShifts.map((s) => (
                  <Pressable
                    key={s.assignmentId}
                    onPress={() => setOfferedId(s.assignmentId)}
                    className={cn('flex-row items-center p-3 rounded-xl border', offeredId === s.assignmentId ? 'border-primary border-2 bg-primary/10' : 'border-line dark:border-line-dark')}
                  >
                    <View className="flex-1">
                      <Text className="font-semibold">{s.shiftName} ({s.startTime} – {s.endTime})</Text>
                      <Text variant="caption" tone="muted">{dayjs(s.date).format('dddd, DD/MM/YYYY')}</Text>
                    </View>
                    {offeredId === s.assignmentId ? <Icon name="check-circle" size={20} tone="primary" /> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </Sheet>

      {/* ── Manage post / claim sheet ── */}
      <Sheet
        visible={!!managePost}
        title="Bài đăng"
        onClose={() => setManagePost(null)}
        footer={
          managePost ? (
            <View className="gap-2">
              {managePost.status === 'Open' && managePost.posterId === user?.id ? (
                <Button variant="outline" action="error" loading={busy} onPress={() => runAction(() => cancelShiftPoolPost(managePost.id), () => setManagePost(null))}>Huỷ bài đăng</Button>
              ) : null}
              {managePost.status === 'WaitingApproval' && managePost.posterId === user?.id ? (
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button variant="outline" action="error" loading={busy} onPress={() => runAction(() => reviewShiftPoolPost(managePost.id, { action: 'RejectClaim' }), () => setManagePost(null))}>Từ chối</Button>
                  </View>
                  <View className="flex-1">
                    <Button loading={busy} onPress={() => runAction(() => reviewShiftPoolPost(managePost.id, { action: 'Approve' }), () => setManagePost(null))}>Xác nhận</Button>
                  </View>
                </View>
              ) : null}
            </View>
          ) : undefined
        }
      >
        {managePost ? (
          <View className="gap-1">
            <Text variant="subtitle">{NEED_TYPE_LABEL[managePost.needType]} · {managePost.shiftName}</Text>
            <Text variant="bodySmall" tone="muted">{dayjs(managePost.shiftDate).format('dddd, DD/MM/YYYY')} · {managePost.shiftStartTime} – {managePost.shiftEndTime}</Text>
            <Badge tone={POOL_STATUS_TONE[managePost.status]} className="mt-1">{POOL_STATUS_LABEL[managePost.status]}</Badge>
            {managePost.claimerName ? <Text variant="bodySmall" className="mt-2">Người nhận: <Text className="font-bold">{managePost.claimerName}</Text></Text> : null}
            {managePost.reviewNote ? <Text variant="bodySmall" tone="muted" className="mt-1">Phản hồi: {managePost.reviewNote}</Text> : null}
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
