import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs, { Dayjs } from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Icon, Skeleton, Button, ProgressRing, Donut, Pressable } from 'src/components/ui';
import { haptics } from 'src/services/haptics';
import { fmtMoney, fmtCompact } from 'src/features/admin-dashboard/hooks';
import { useFinancialOverview, type IFinancialOverview } from './hooks';
import { brand } from 'src/theme';

// ----------------------------------------------------------------------
// Tổng quan tài chính (Admin): doanh thu — giá vốn — chi phí — lợi nhuận
// ròng của tháng, tiến độ hòa vốn, dự phóng cuối tháng, so kỳ trước (MoM)
// và cơ cấu chi phí. Đồng bộ core-fe report-dashboard-view.tsx, rút gọn
// cho màn hình di động (không dùng thư viện chart, chỉ SVG sẵn có).
// ----------------------------------------------------------------------

function fmtPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

function monthRange(anchor: Dayjs) {
  const isCurrentMonth = anchor.isSame(dayjs(), 'month');
  const fromDate = anchor.startOf('month').format('YYYY-MM-DD');
  const toDate = isCurrentMonth ? dayjs().format('YYYY-MM-DD') : anchor.endOf('month').format('YYYY-MM-DD');
  return { fromDate, toDate };
}

function MonthNav({ anchor, onChange }: { anchor: Dayjs; onChange: (next: Dayjs) => void }) {
  return (
    <View className="flex-row items-center justify-between">
      <Pressable
        onPress={() => { haptics.selection(); onChange(anchor.subtract(1, 'month')); }}
        hitSlop={8}
        className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark"
      >
        <Icon name="chevron-left" size={20} tone="muted" />
      </Pressable>
      <Text variant="subtitle" className="capitalize">
        Tháng {anchor.format('MM/YYYY')}
      </Text>
      <Pressable
        onPress={() => { haptics.selection(); onChange(anchor.add(1, 'month')); }}
        hitSlop={8}
        disabled={anchor.isSame(dayjs(), 'month')}
        className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark"
        style={anchor.isSame(dayjs(), 'month') ? { opacity: 0.35 } : undefined}
      >
        <Icon name="chevron-right" size={20} tone="muted" />
      </Pressable>
    </View>
  );
}

function KpiGrid({ overview }: { overview: IFinancialOverview }) {
  const { revenue, expense } = overview;
  const netProfit = revenue.grossProfit - expense.totalExpense;

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <Card className="flex-1 p-4 gap-1">
          <Text variant="caption" tone="muted">Doanh thu</Text>
          <Text className="text-lg font-bold text-primary">{fmtCompact(revenue.totalRevenue)}</Text>
        </Card>
        <Card className="flex-1 p-4 gap-1">
          <Text variant="caption" tone="muted">Giá vốn</Text>
          <Text className="text-lg font-bold text-ink dark:text-white">{fmtCompact(revenue.totalCost)}</Text>
        </Card>
      </View>
      <View className="flex-row gap-3">
        <Card className="flex-1 p-4 gap-1">
          <Text variant="caption" tone="muted">Lợi nhuận gộp</Text>
          <Text className="text-lg font-bold text-success">{fmtCompact(revenue.grossProfit)}</Text>
        </Card>
        <Card className="flex-1 p-4 gap-1">
          <Text variant="caption" tone="muted">Chi phí vận hành</Text>
          <Text className="text-lg font-bold text-error">{fmtCompact(expense.totalExpense)}</Text>
        </Card>
      </View>
      <Card className="p-4 gap-1">
        <Text variant="caption" tone="muted">Lợi nhuận ròng</Text>
        <Text className={`text-2xl font-bold ${netProfit >= 0 ? 'text-success' : 'text-error'}`}>
          {fmtMoney(netProfit)}
        </Text>
      </Card>
    </View>
  );
}

function BreakEvenSummary({ overview }: { overview: IFinancialOverview }) {
  const { breakEven } = overview;
  const achievedPercent = breakEven.breakEvenRevenue > 0
    ? Math.min(999, (breakEven.actualRevenue / breakEven.breakEvenRevenue) * 100)
    : 0;
  const ringPercent = Math.min(100, achievedPercent);
  const ringColor = achievedPercent >= 100 ? brand.success : brand.error;

  return (
    <Card className="p-4">
      <View className="flex-row items-center gap-2 mb-3">
        <Icon name="target" size={18} tone="primary" />
        <Text variant="subtitle" className="flex-1">Điểm hòa vốn (tháng)</Text>
      </View>

      <View className="flex-row items-center gap-4">
        <ProgressRing size={92} stroke={9} progress={ringPercent / 100} color={ringColor}>
          <Text className="text-lg font-bold" style={{ color: ringColor }}>
            {achievedPercent.toFixed(0)}%
          </Text>
        </ProgressRing>
        <View className="flex-1 gap-1.5">
          <View className="flex-row justify-between">
            <Text variant="bodySmall" tone="muted">Cần đạt</Text>
            <Text variant="bodySmall" className="font-semibold">{fmtMoney(breakEven.breakEvenRevenue)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text variant="bodySmall" tone="muted">Thực tế</Text>
            <Text variant="bodySmall" className="font-semibold">{fmtMoney(breakEven.actualRevenue)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text variant="bodySmall" tone="muted">%Giá vốn tự tính</Text>
            <Text variant="bodySmall" className="font-semibold">{fmtPercent(breakEven.cogsRatio * 100)}</Text>
          </View>
        </View>
      </View>

      <Button
        variant="outline"
        size="sm"
        fullWidth={false}
        className="mt-3 self-start"
        icon="chart-donut"
        onPress={() => router.push('/admin/break-even' as any)}
      >
        Xem chi tiết điểm hòa vốn
      </Button>
    </Card>
  );
}

function RunRateSection({ overview, toDate }: { overview: IFinancialOverview; toDate: string }) {
  const advanced = useMemo(() => {
    const { breakEven, revenue } = overview;
    const to = dayjs(toDate);
    const daysInMonth = to.daysInMonth();
    const isCurrentMonth = to.isSame(dayjs(), 'month');
    const daysElapsed = isCurrentMonth ? Math.min(daysInMonth, to.date()) : daysInMonth;

    const contributionMargin = 1 - breakEven.cogsRatio;
    const opexMonth = breakEven.operatingCost?.total ?? breakEven.fixedCosts;
    const runRateRevenue = daysElapsed > 0 ? (breakEven.actualRevenue / daysElapsed) * daysInMonth : 0;
    const projectedNetProfit = runRateRevenue * contributionMargin - opexMonth;
    const dailyBreakEvenTarget = daysInMonth > 0 ? breakEven.breakEvenRevenue / daysInMonth : 0;
    const actualDailyAvg = daysElapsed > 0 ? breakEven.actualRevenue / daysElapsed : 0;

    const aov = revenue.averageOrderValue > 0 ? revenue.averageOrderValue : 0;
    const breakEvenOrders = aov > 0 ? Math.ceil(breakEven.breakEvenRevenue / aov) : 0;

    return {
      daysElapsed,
      daysInMonth,
      runRateRevenue,
      projectedNetProfit,
      dailyBreakEvenTarget,
      actualDailyAvg,
      breakEvenOrders,
      aov,
      currentOrders: revenue.totalOrders,
    };
  }, [overview, toDate]);

  return (
    <>
      <Text variant="subtitle" className="mt-1">
        Dự phóng cuối tháng ({advanced.daysElapsed}/{advanced.daysInMonth} ngày)
      </Text>
      <View className="flex-row gap-3">
        <Card className="flex-1 p-3 gap-1">
          <Text variant="caption" tone="muted">Doanh thu dự phóng</Text>
          <Text className="text-base font-bold text-primary">{fmtCompact(advanced.runRateRevenue)}</Text>
        </Card>
        <Card className="flex-1 p-3 gap-1">
          <Text variant="caption" tone="muted">LN ròng dự phóng</Text>
          <Text className={`text-base font-bold ${advanced.projectedNetProfit >= 0 ? 'text-success' : 'text-error'}`}>
            {fmtCompact(advanced.projectedNetProfit)}
          </Text>
        </Card>
      </View>
      <View className="flex-row gap-3">
        <Card className="flex-1 p-3 gap-1">
          <Text variant="caption" tone="muted">Cần đạt/ngày</Text>
          <Text className="text-base font-bold">{fmtCompact(advanced.dailyBreakEvenTarget)}</Text>
        </Card>
        <Card className="flex-1 p-3 gap-1">
          <Text variant="caption" tone="muted">TB thực tế/ngày</Text>
          <Text
            className={`text-base font-bold ${advanced.actualDailyAvg >= advanced.dailyBreakEvenTarget ? 'text-success' : 'text-error'}`}
          >
            {fmtCompact(advanced.actualDailyAvg)}
          </Text>
        </Card>
      </View>

      <Card className="p-4 gap-2">
        <Text variant="subtitle">Đơn hàng hòa vốn</Text>
        <View className="flex-row justify-between items-end">
          <View>
            <Text variant="caption" tone="muted">Số đơn cần/tháng</Text>
            <Text className="text-2xl font-bold text-primary">
              {advanced.breakEvenOrders > 0 ? advanced.breakEvenOrders.toLocaleString('vi-VN') : '—'}
            </Text>
          </View>
          <View className="items-end gap-1">
            <Text variant="caption" tone="muted">Giá trị đơn TB: {fmtMoney(advanced.aov)}</Text>
            <Text variant="caption" tone="muted">Đơn thực tế (kỳ): {advanced.currentOrders.toLocaleString('vi-VN')}</Text>
          </View>
        </View>
      </Card>
    </>
  );
}

function MomSection({ overview }: { overview: IFinancialOverview }) {
  const { revenue, expense, prevRevenue, prevExpense } = overview;

  const rows = useMemo(() => {
    const pct = (cur: number, prev: number) => (prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null);
    const curNet = revenue.grossProfit - expense.totalExpense;
    const prevNet = prevRevenue.grossProfit - prevExpense.totalExpense;
    return [
      { label: 'Doanh thu', cur: revenue.totalRevenue, prev: prevRevenue.totalRevenue, goodUp: true },
      { label: 'Chi phí', cur: expense.totalExpense, prev: prevExpense.totalExpense, goodUp: false },
      { label: 'Lợi nhuận ròng', cur: curNet, prev: prevNet, goodUp: true },
    ].map((r) => ({ ...r, pct: pct(r.cur, r.prev) }));
  }, [revenue, expense, prevRevenue, prevExpense]);

  return (
    <Card className="p-4 gap-3">
      <Text variant="subtitle">So với kỳ trước</Text>
      {rows.map((row) => {
        const up = row.pct !== null && row.pct >= 0;
        const good = row.pct === null ? undefined : row.goodUp ? up : !up;
        return (
          <View key={row.label} className="flex-row items-center justify-between">
            <Text variant="bodySmall" tone="muted">{row.label}</Text>
            <View className="flex-row items-center gap-2">
              <Text variant="bodySmall" className="font-semibold">{fmtMoney(row.cur)}</Text>
              <Text
                variant="caption"
                className={`font-bold ${good === undefined ? 'text-faint' : good ? 'text-success' : 'text-error'}`}
              >
                {row.pct === null ? '—' : `${up ? '▲' : '▼'} ${Math.abs(row.pct).toFixed(1)}%`}
              </Text>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const COST_COLORS = [brand.primary, brand.info, brand.warning, brand.muted];

function CostStructure({ overview }: { overview: IFinancialOverview }) {
  const oc = overview.breakEven.operatingCost;
  const segments = useMemo(() => {
    if (!oc) return [];
    return [
      { label: 'Cố định', value: oc.fixedCost },
      { label: 'Biến đổi', value: oc.variableCost },
      { label: 'Lương', value: oc.laborCost },
      { label: 'Khác', value: oc.otherCost },
    ].filter((s) => s.value > 0);
  }, [oc]);

  const total = segments.reduce((s, x) => s + x.value, 0);

  return (
    <Card className="p-4">
      <Text variant="subtitle" className="mb-3">Cơ cấu chi phí hoạt động</Text>
      {segments.length === 0 ? (
        <Text variant="bodySmall" tone="muted">Chưa có dữ liệu chi phí.</Text>
      ) : (
        <View className="flex-row items-center gap-4">
          <Donut
            size={110}
            stroke={18}
            segments={segments.map((s, i) => ({ value: s.value, color: COST_COLORS[i % COST_COLORS.length] }))}
          >
            <Text className="text-xs font-bold">{fmtCompact(total)}</Text>
          </Donut>
          <View className="flex-1 gap-2">
            {segments.map((s, i) => (
              <View key={s.label} className="flex-row items-center gap-2">
                <View className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: COST_COLORS[i % COST_COLORS.length] }} />
                <Text variant="bodySmall" className="flex-1" tone="muted">{s.label}</Text>
                <Text variant="bodySmall" className="font-semibold">{fmtCompact(s.value)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </Card>
  );
}

export function FinancialOverviewScreen() {
  const [anchor, setAnchor] = useState(dayjs());
  const { fromDate, toDate } = monthRange(anchor);
  const { data, isLoading, isError, isFetching, refetch } = useFinancialOverview(fromDate, toDate);

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Tổng quan tài chính" subtitle="Doanh thu · chi phí · điểm hòa vốn" back />

      <MonthNav anchor={anchor} onChange={setAnchor} />

      {isLoading ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Skeleton width="48%" height={80} radius={16} />
            <Skeleton width="48%" height={80} radius={16} />
          </View>
          <Skeleton width="100%" height={160} radius={16} />
          <Skeleton width="100%" height={160} radius={16} />
        </View>
      ) : isError || !data ? (
        <ErrorView onRetry={refetch} />
      ) : data.revenue.periods.length === 0 && data.expense.periods.length === 0 ? (
        <EmptyState icon="finance" title="Chưa có dữ liệu trong tháng này" />
      ) : (
        <>
          <KpiGrid overview={data} />
          <BreakEvenSummary overview={data} />
          <RunRateSection overview={data} toDate={toDate} />
          <MomSection overview={data} />
          <CostStructure overview={data} />
        </>
      )}
    </Screen>
  );
}
