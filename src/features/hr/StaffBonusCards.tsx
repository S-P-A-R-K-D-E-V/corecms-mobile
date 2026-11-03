import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard } from 'src/components/shared';
import { Text, Badge, Pressable } from 'src/components/ui';
import { getMyQuarterBonus, getMyViolations, getMyWeeklyBonus, getStoreWeeklyBonus } from 'src/api/hr';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import { fmtMoney } from 'src/features/admin-dashboard/hooks';
import type { QuarterBonusStatus } from 'src/types/hr';

import { monthOf, storeTargetSummary } from './hr-rules';

// ----------------------------------------------------------------------
// Thẻ trang chủ nhân viên: target tuần của cửa hàng, điểm trừ tháng, thưởng quý. Tiền quy đổi từ điểm trừ chỉ để thấy mức độ, không trừ
// vào lương. Cửa hàng không dùng tính năng nào thì thẻ đó không hiện.
// ----------------------------------------------------------------------

const QUARTER_STATUS: Record<QuarterBonusStatus, { label: string; tone: 'success' | 'warning' | 'error' }> = {
  Eligible: { label: 'Đủ', tone: 'success' },
  AtRisk: { label: 'Rủi ro', tone: 'warning' },
  Lost: { label: 'Mất', tone: 'error' },
};

function Bar({ pct, marks = [], tone = 'bg-primary' }: { pct: number; marks?: number[]; tone?: string }) {
  return (
    <View className="h-1.5 rounded-full bg-muted">
      <View className={`h-1.5 rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      {marks.map((m) => (
        <View key={m} className="absolute top-0 h-1.5 w-0.5 bg-foreground" style={{ left: `${Math.min(100, m)}%` }} />
      ))}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text variant="caption" tone="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="caption" className="font-semibold">
        {value}
      </Text>
    </View>
  );
}

export function WeeklyTargetCard() {
  const today = dayjs().format('YYYY-MM-DD');
  const query = useQuery({
    queryKey: ['hr', 'weekly-bonus', 'mine', today],
    queryFn: () => getMyWeeklyBonus(today, today),
    retry: false,
  });
  const week = query.data?.[0];
  if (!week) return null;

  return (
    <SectionCard title="Target tuần cửa hàng" icon="target" bodyClassName="pt-0 gap-2">
      <View className="flex-row items-end gap-2">
        <Text variant="title">{week.achievementPct}%</Text>
        <Text variant="caption" tone="muted" className="mb-1">
          đạt target, tuần từ {dayjs(week.weekStart).format('DD/MM')}
        </Text>
      </View>
      <Bar pct={week.achievementPct} />
      <Line label="Quỹ tạm tính" value={fmtMoney(week.fund)} />
      <Line label={`Phần của tôi ước tính (${week.myHours}/${week.totalHours} giờ)`} value={fmtMoney(week.myAmount)} />
      {week.paidInPayroll ? null : (
        <Text variant="caption" tone="muted">
          Tuần này chỉ tính thử, chưa vào lương.
        </Text>
      )}
    </SectionCard>
  );
}

/**
 * Target tuần của cả cửa hàng cho Admin (hr.target.manage): target, doanh thu tính thưởng tới hiện tại, % đạt — số liệu
 * của màn thưởng tuần tính thử, không tự tính lại. Tuần chưa có target / cửa hàng tắt thưởng tuần thì không hiện.
 */
export function StoreWeeklyTargetCard() {
  const { user } = useAuthContext();
  const today = dayjs().format('YYYY-MM-DD');
  const query = useQuery({
    queryKey: ['hr', 'weekly-bonus', 'store', today],
    queryFn: () => getStoreWeeklyBonus(today, today),
    enabled: hasPermission(user, PERMISSIONS.hr.targetManage),
    retry: false,
    staleTime: 60_000,
  });
  const week = query.data?.[0];
  if (!week) return null;
  const s = storeTargetSummary(week);

  return (
    <SectionCard title="Target tuần cửa hàng" icon="target" right={<Text variant="caption" tone="muted">{s.week}</Text>} bodyClassName="pt-0 gap-2">
      <View className="flex-row items-end gap-2">
        <Text variant="title" tone={s.reached ? 'success' : 'default'}>
          {s.pct}%
        </Text>
        <Text variant="caption" tone="muted" className="mb-1">
          đạt target tuần
        </Text>
      </View>
      <Bar pct={s.pct} tone={s.reached ? 'bg-success' : 'bg-primary'} />
      <Line label="Target tuần" value={fmtMoney(week.target)} />
      <Line label="Doanh thu tính target tới hiện tại" value={fmtMoney(week.revenue)} />
      <Line label={s.reached ? 'Đã vượt target' : 'Còn thiếu'} value={fmtMoney(s.gap)} />
      <Line label="Quỹ thưởng tuần tạm tính" value={fmtMoney(week.fund)} />
    </SectionCard>
  );
}

export function ViolationPointsCard() {
  const month = monthOf();
  const query = useQuery({
    queryKey: ['hr', 'violations', 'mine', month],
    queryFn: () => getMyViolations(month),
    retry: false,
  });
  const data = query.data;
  if (!data?.policy) return null;

  const { policy, summary } = data;
  const marks = [policy.halfBonusFromPoints, policy.noBonusFromPoints, policy.notCompleteFromPoints].filter((m): m is number => m != null);
  const max = Math.max(marks[marks.length - 1] ?? 15, summary.points, 1);
  const lost = summary.points >= (policy.noBonusFromPoints ?? Infinity);
  const half = summary.points >= (policy.halfBonusFromPoints ?? Infinity);

  return (
    <Pressable onPress={() => router.push('/hr/violations' as any)}>
      <SectionCard title="Điểm trừ tháng" icon="alert-circle-outline" bodyClassName="pt-0 gap-2">
        <Text variant="title">{summary.points} điểm</Text>
        <Bar pct={(summary.points / max) * 100} marks={marks.map((m) => (m / max) * 100)} tone={lost ? 'bg-error' : half ? 'bg-warning' : 'bg-primary'} />
        {marks.length > 0 ? (
          <Text variant="caption" tone="muted">
            Mốc: {marks.join(' / ')} điểm. Bấm để xem lỗi và khiếu nại.
          </Text>
        ) : null}
        {(summary.fineAmount ?? 0) > 0 ? (
          <Line label="Tiền phạt (trừ vào lương)" value={fmtMoney(summary.fineAmount)} />
        ) : null}
      </SectionCard>
    </Pressable>
  );
}

export function QuarterBonusCard() {
  const query = useQuery({ queryKey: ['hr', 'quarter-bonus', 'mine'], queryFn: getMyQuarterBonus, retry: false });
  const data = query.data;
  if (!data) return null;

  const status = QUARTER_STATUS[data.status];
  return (
    <SectionCard title="Thưởng quý" icon="gift-outline" right={<Badge tone={status.tone}>{status.label}</Badge>} bodyClassName="pt-0 gap-2">
      <Line label="Giờ đã làm / ngưỡng" value={`${data.hours} / ${data.minHours}`} />
      <Bar pct={data.minHours > 0 ? (data.hours / data.minHours) * 100 : 0} />
      <Line label="Điểm trừ cao nhất trong tháng" value={`${data.maxMonthlyPoints} (mất từ ${data.monthlyPointsLimit})`} />
      <Line label="Mức dự kiến" value={fmtMoney(data.expectedAmount)} />
      {data.reasons.map((reason) => (
        <Text key={reason} variant="caption" tone="muted">
          {reason}
        </Text>
      ))}
    </SectionCard>
  );
}
