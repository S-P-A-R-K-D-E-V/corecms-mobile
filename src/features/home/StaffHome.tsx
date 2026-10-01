import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable, Badge, Divider, Skeleton, type IconName } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { useAuthContext } from 'src/auth/auth-context';
import { isAdminUser, isManagerUser } from 'src/auth/roles';
import { t } from 'src/i18n';
import type { ICleaningTaskInstance, IMyScheduleItem } from 'src/types/corecms-api';

import { FeatureGrid } from 'src/features/launcher/FeatureGrid';
import { useCheckinData } from 'src/features/checkin/hooks';
import { getCheckInWindow, formatTime } from 'src/features/checkin/utils';
import { useDashboardSummary, fmtMoney, fmtCompact } from 'src/features/admin-dashboard/hooks';

import { HomeHero, HeroLabel, HeroAmount, HeroStats, HeroChip, HERO_OVERLAP } from './HomeHero';
import { TeamTodayCard } from './TeamTodayCard';
import {
  useAmountVisibility,
  useMyEstimate,
  usePayPeriod,
  usePeriodReport,
  usePeriodSchedule,
  useTodayCleaning,
  useUpcomingSchedule,
} from './hooks';

// ----------------------------------------------------------------------
// Trang chủ nhân viên: thẻ "số dư" = lương tạm tính kỳ đang chạy (ẩn mặc định); Dùng nhanh; ca làm hôm
// nay + nút chấm công; việc vệ sinh hôm nay; số liệu trong kỳ (ca được phân, đi muộn, về sớm, vắng).
// Quản lý thấy thêm nhân sự hôm nay; Admin kiêm ca thấy thêm doanh thu cửa hàng.
// ----------------------------------------------------------------------

const fmtDay = (d: string) => dayjs(d).format('DD/MM');

function StaffBalance() {
  const est = useMyEstimate();
  const showSalary = useAmountVisibility((s) => s.salary);
  const toggle = useAmountVisibility((s) => s.toggle);
  const e = est.data;

  const period = e ? `${fmtDay(e.fromDate)} – ${fmtDay(e.toDate)}` : null;

  return (
    <View>
      <Pressable onPress={() => router.push('/(tabs)/payroll' as any)} className="flex-row items-center gap-1">
        <HeroLabel>
          {t('home.salaryEstimate')}
          {e?.cycleName ? ` · ${e.cycleName}` : period ? ` · ${period}` : ''}
        </HeroLabel>
        <Icon name="chevron-right" size={16} color="rgba(255,255,255,0.72)" />
      </Pressable>

      {est.isLoading ? (
        <View style={{ height: 36, width: 180, borderRadius: 10, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.18)' }} />
      ) : e?.configured ? (
        <HeroAmount value={fmtMoney(e.estimatedSalary)} hidden={!showSalary} onToggle={() => toggle('salary')} />
      ) : (
        <HeroAmount value="—" />
      )}

      {est.isError ? (
        <HeroChip icon="information-outline">{t('home.salaryUnavailable')}</HeroChip>
      ) : e && !e.configured ? (
        <HeroChip icon="information-outline">{t('home.salaryNotConfigured')}</HeroChip>
      ) : e ? (
        <HeroChip icon="calendar-check-outline">{t('home.salaryAsOf', { date: fmtDay(e.asOf) })}</HeroChip>
      ) : null}

      {e ? (
        <HeroStats
          items={[
            { label: t('home.shiftsWorked'), value: `${e.workedShifts}/${e.assignedShifts}` },
            { label: t('home.hoursWorked'), value: `${Math.round(e.hoursWorked * 10) / 10}h` },
            { label: t('home.lateMinutes'), value: e.lateMinutes },
          ]}
        />
      ) : null}
    </View>
  );
}

// ── Ca làm hôm nay ──────────────────────────────────────────────────────

function ShiftLine({ shift }: { shift: IMyScheduleItem }) {
  const w = getCheckInWindow(shift, dayjs());
  const badge = shift.hasCheckedOut
    ? { tone: 'neutral' as const, label: t('home.shiftDone') }
    : {
        'checked-in': { tone: 'success' as const, label: t('home.statusWorking') },
        allowed: { tone: 'primary' as const, label: t('home.shiftOpen') },
        'too-early': { tone: 'info' as const, label: t('home.shiftLater') },
        'too-late': { tone: 'error' as const, label: t('home.shiftMissed') },
      }[w.status];
  return (
    <View className="flex-row items-center gap-3 py-2">
      <View className="w-[58px] items-center rounded-xl bg-primary-soft py-1.5">
        <Text variant="bodySmall" tone="primary" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{shift.startTime}</Text>
        <Text variant="caption" tone="primary" style={{ fontVariant: ['tabular-nums'], opacity: 0.75 }}>{shift.endTime}</Text>
      </View>
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{shift.shiftName}</Text>
        <Text variant="caption" tone="muted">
          {shift.totalHours}h{shift.checkInTime ? `  ·  ${t('home.inAt', { time: formatTime(shift.checkInTime) })}` : ''}
        </Text>
      </View>
      <Badge tone={badge.tone}>{badge.label}</Badge>
    </View>
  );
}

function TodayShiftCard() {
  const { shifts, activeLog, loading } = useCheckinData();
  const upcoming = useUpcomingSchedule();
  const today = dayjs().format('YYYY-MM-DD');

  const sorted = useMemo(() => [...shifts].sort((a, b) => a.startTime.localeCompare(b.startTime)), [shifts]);
  const next = useMemo(
    () => (upcoming.data ?? []).filter((s) => s.date > today).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))[0],
    [upcoming.data, today]
  );
  const canCheckIn = sorted.some((s) => getCheckInWindow(s, dayjs()).status === 'allowed');

  return (
    <SectionCard title={t('home.todayShift')} icon="calendar-clock" right={<Text variant="caption" tone="muted">{dayjs().format('ddd DD/MM')}</Text>} bodyClassName="pt-0">
      {loading ? (
        <Skeleton width="100%" height={64} radius={12} />
      ) : sorted.length === 0 ? (
        <View className="flex-row items-center gap-3 py-1">
          <Icon name="coffee-outline" size={24} tone="faint" />
          <View className="flex-1">
            <Text variant="bodySmall" tone="muted">{t('home.noShiftToday')}</Text>
            {next ? (
              <Text variant="caption" tone="primary" className="font-semibold mt-0.5">
                {t('home.nextShift', { when: `${dayjs(next.date).format('ddd DD/MM')} · ${next.shiftName} ${next.startTime}–${next.endTime}` })}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        sorted.map((s, i) => (
          <View key={s.assignmentId}>
            {i > 0 ? <Divider className="ml-[70px]" /> : null}
            <ShiftLine shift={s} />
          </View>
        ))
      )}

      {sorted.length > 0 ? (
        <Pressable
          onPress={() => router.push('/(tabs)/checkin' as any)}
          className={cn(
            'mt-2 h-12 rounded-2xl flex-row items-center justify-center gap-2',
            activeLog || canCheckIn ? 'bg-primary' : 'bg-primary-soft'
          )}
        >
          <Icon name="fingerprint" size={20} tone={activeLog || canCheckIn ? 'inverse' : 'primary'} />
          <Text tone={activeLog || canCheckIn ? 'inverse' : 'primary'} className="font-bold text-[15px]">
            {activeLog ? t('home.workingSince', { time: formatTime(activeLog.checkInTime) }) : t('home.goCheckin')}
          </Text>
        </Pressable>
      ) : null}
    </SectionCard>
  );
}

// ── Việc vệ sinh hôm nay ────────────────────────────────────────────────

const TASK_ICON: Record<string, { icon: IconName; tone: 'faint' | 'success' | 'error' | 'primary' }> = {
  Pending: { icon: 'checkbox-blank-circle-outline', tone: 'faint' },
  Done: { icon: 'check-circle-outline', tone: 'primary' },
  Passed: { icon: 'check-circle', tone: 'success' },
  Failed: { icon: 'close-circle', tone: 'error' },
};

function CleaningTasksCard() {
  const { data, isError } = useTodayCleaning();
  const tasks: ICleaningTaskInstance[] = (data ?? []).flatMap((s) => s.tasks);
  if (isError || tasks.length === 0) return null;

  const done = tasks.filter((x) => x.status !== 'Pending').length;
  const pct = Math.round((done / tasks.length) * 100);
  // Việc chưa làm lên trước.
  const shown = [...tasks].sort((a, b) => Number(a.status !== 'Pending') - Number(b.status !== 'Pending')).slice(0, 5);

  return (
    <Pressable onPress={() => router.push('/cleaning' as any)}>
      <SectionCard
        title={t('home.cleaningToday')}
        icon="broom"
        right={
          <Text variant="caption" tone={done === tasks.length ? 'success' : 'muted'} className="font-semibold">
            {t('home.cleaningProgress', { done, total: tasks.length })}
          </Text>
        }
        bodyClassName="pt-0"
      >
        <View className="h-1.5 rounded-full bg-ink/5 dark:bg-white/10 overflow-hidden mb-1.5">
          <View className={cn('h-full rounded-full', done === tasks.length ? 'bg-success' : 'bg-primary')} style={{ width: `${Math.max(3, pct)}%` }} />
        </View>
        {shown.map((task) => {
          const ic = TASK_ICON[task.status] ?? TASK_ICON.Pending;
          return (
            <View key={task.id} className="flex-row items-center gap-2.5 py-1.5">
              <Icon name={ic.icon} size={20} tone={ic.tone} />
              <Text
                variant="bodySmall"
                tone={task.status === 'Pending' ? 'default' : 'muted'}
                className={cn('flex-1', task.status !== 'Pending' && 'line-through')}
                numberOfLines={1}
              >
                {task.name}
              </Text>
              {task.area ? <Text variant="caption" tone="faint" numberOfLines={1}>{task.area}</Text> : null}
            </View>
          );
        })}
        {tasks.length > shown.length ? (
          <Text variant="caption" tone="primary" className="font-semibold mt-1">+{tasks.length - shown.length}</Text>
        ) : null}
      </SectionCard>
    </Pressable>
  );
}

// ── Số liệu trong kỳ ────────────────────────────────────────────────────

function MiniStat({ value, label, tone }: { value: React.ReactNode; label: string; tone: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'default' }) {
  return (
    <View className="w-1/3 px-1 py-2">
      <Text
        className="text-[22px] leading-[28px] font-bold"
        tone={tone === 'info' ? 'default' : tone}
        style={{ fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text variant="caption" tone="muted" numberOfLines={1}>{label}</Text>
    </View>
  );
}

function PeriodStatsCard() {
  const { from, to, ready } = usePayPeriod();
  const est = useMyEstimate();
  const report = usePeriodReport(from, ready);
  const schedule = usePeriodSchedule(from, to, ready);
  const { shifts } = useCheckinData();

  const r = report.data;
  const assigned = est.data?.assignedShifts ?? schedule.data?.length;
  // Báo cáo tính "vắng" = ca được phân trong khoảng mà chưa chấm — ca hôm nay chưa kết thúc chưa thể là vắng.
  const notYetToday = shifts.filter((s) => !s.hasCheckedIn && dayjs().isBefore(dayjs(`${s.date} ${s.endTime}`))).length;
  const absent = r ? Math.max(0, r.absentShifts - notYetToday) : undefined;

  if (!ready || report.isLoading) {
    return <Skeleton width="100%" height={150} radius={20} />;
  }

  return (
    <SectionCard
      title={t('home.monthStats')}
      icon="chart-box-outline"
      right={<Text variant="caption" tone="muted">{fmtDay(from)} – {fmtDay(to)}</Text>}
      bodyClassName="pt-0"
    >
      <View className="flex-row flex-wrap -mx-1">
        <MiniStat value={assigned ?? '—'} label={t('home.statAssigned')} tone="primary" />
        <MiniStat value={r?.presentShifts ?? '—'} label={t('home.statPresent')} tone="success" />
        <MiniStat value={r ? `${Math.round(r.totalWorkedHours * 10) / 10}h` : '—'} label={t('home.statHours')} tone="default" />
        <MiniStat
          value={r ? (r.totalLateMinutes > 0 ? `${r.lateCount} · ${t('home.minutesShort', { n: r.totalLateMinutes })}` : r.lateCount) : '—'}
          label={t('home.statLate')}
          tone={r && r.lateCount > 0 ? 'warning' : 'default'}
        />
        <MiniStat value={r?.earlyLeaveCount ?? '—'} label={t('home.statEarly')} tone={r && r.earlyLeaveCount > 0 ? 'warning' : 'default'} />
        <MiniStat value={absent ?? '—'} label={t('home.statAbsent')} tone={absent ? 'error' : 'default'} />
      </View>
    </SectionCard>
  );
}

/** Admin kiêm ca: doanh thu cửa hàng gọn, bấm mở báo cáo tổng quan. */
function StoreRevenueMini() {
  const { data } = useDashboardSummary();
  if (!data) return null;
  return (
    <Pressable onPress={() => router.push('/(tabs)/admin' as any)}>
      <SectionCard title={t('home.storeRevenue')} icon="chart-line" right={<Text variant="caption" tone="primary" className="font-semibold">{t('home.openReport')}</Text>} bodyClassName="pt-0">
        <View className="flex-row">
          <View className="flex-1">
            <Text variant="caption" tone="muted">{t('home.today')}</Text>
            <Text className="text-[18px] font-bold" tone="primary">{fmtMoney(data.todayRevenue)}</Text>
            <Text variant="caption" tone="muted">{t('home.orders', { n: data.todayOrders })}</Text>
          </View>
          <View className="flex-1">
            <Text variant="caption" tone="muted">{t('admin.revenueMonth')}</Text>
            <Text className="text-[18px] font-bold">{fmtCompact(data.monthRevenue)}</Text>
            <Text variant="caption" tone="muted">{t('home.orders', { n: data.monthOrders })}</Text>
          </View>
        </View>
      </SectionCard>
    </Pressable>
  );
}

export function StaffHome() {
  const { user } = useAuthContext();
  const qc = useQueryClient();
  const { refreshing } = useCheckinData();

  const onRefresh = () =>
    qc.invalidateQueries({
      predicate: (q) => ['home', 'attendance', 'schedule', 'cleaning', 'admin', 'notifications'].includes(q.queryKey[0] as string),
    });

  return (
    <Screen scroll padded={false} edges={['left', 'right']} refreshing={refreshing} onRefresh={onRefresh}>
      <HomeHero>
        <StaffBalance />
      </HomeHero>

      <View className="px-4 gap-3.5" style={{ marginTop: -HERO_OVERLAP - 14 }}>
        <FeatureGrid solid variant="staff" title={t('home.quickActions')} onSeeAll={() => router.push('/(tabs)/features' as any)} />
        <TodayShiftCard />
        <CleaningTasksCard />
        {isManagerUser(user) ? <TeamTodayCard /> : null}
        {isAdminUser(user) ? <StoreRevenueMini /> : null}
        <PeriodStatsCard />
      </View>
    </Screen>
  );
}
