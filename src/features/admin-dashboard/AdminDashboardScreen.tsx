import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, StatCard, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Icon, Skeleton, SegmentedControl, CountUp } from 'src/components/ui';
import type { IRecentOrder, ITopSellingProduct, IPaymentMethodReport } from 'src/types/corecms-api';
import { t } from 'src/i18n';

import { RevenueChart } from './RevenueChart';
import {
  useDashboardSummary,
  useRevenueReport,
  usePaymentMix,
  useTodayAttendance,
  fmtMoney,
  fmtCompact,
} from './hooks';

// ----------------------------------------------------------------------

function SectionTitle({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <View className="flex-row items-center gap-2 mb-2 mt-1">
      <Icon name={icon as any} size={18} tone="primary" />
      <Text variant="subtitle" className="flex-1">
        {title}
      </Text>
      {hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

function KpiGrid() {
  const { data, isLoading, isError, refetch } = useDashboardSummary();

  if (isLoading) {
    return (
      <View className="gap-3">
        <View className="flex-row gap-3">
          <Skeleton width="48%" height={92} radius={16} />
          <Skeleton width="48%" height={92} radius={16} />
        </View>
        <View className="flex-row gap-3">
          <Skeleton width="31%" height={78} radius={16} />
          <Skeleton width="31%" height={78} radius={16} />
          <Skeleton width="31%" height={78} radius={16} />
        </View>
      </View>
    );
  }
  if (isError || !data) return <ErrorView onRetry={refetch} />;

  return (
    <View className="gap-3">
      {/* Doanh thu — 2 ô lớn */}
      <View className="flex-row gap-3">
        <Card className="flex-1 p-4 gap-1">
          <Text variant="caption" tone="muted">
            {t('admin.revenueToday')}
          </Text>
          <CountUp
            value={data.todayRevenue}
            format={fmtCompact}
            className="text-2xl font-bold text-primary"
          />
          <Text variant="caption" tone="muted">
            {data.todayOrders} {t('admin.ordersToday').toLowerCase()}
          </Text>
        </Card>
        <Card className="flex-1 p-4 gap-1">
          <Text variant="caption" tone="muted">
            {t('admin.revenueMonth')}
          </Text>
          <CountUp
            value={data.monthRevenue}
            format={fmtCompact}
            className="text-2xl font-bold text-ink dark:text-white"
          />
          <Text variant="caption" tone="muted">
            {data.monthOrders} {t('admin.ordersMonth').toLowerCase()}
          </Text>
        </Card>
      </View>

      {/* Thống kê nhanh */}
      <View className="flex-row gap-3">
        <StatCard value={data.totalProducts} label={t('admin.products')} tone="info" />
        <StatCard value={data.totalCustomers} label={t('admin.customers')} tone="success" />
        <StatCard
          value={data.lowStockCount}
          label={t('admin.lowStock')}
          tone={data.lowStockCount > 0 ? 'warning' : 'primary'}
        />
      </View>
    </View>
  );
}

function RevenueSection({ days }: { days: number }) {
  const { data, isLoading, isError, refetch } = useRevenueReport(days);

  return (
    <Card className="p-4">
      <SectionTitle
        icon="chart-line"
        title={t('admin.revenueTrend')}
        hint={days === 7 ? t('admin.last7Days') : t('admin.last30Days')}
      />
      {isLoading ? (
        <Skeleton width="100%" height={160} radius={12} />
      ) : isError || !data ? (
        <ErrorView onRetry={refetch} />
      ) : data.periods.length === 0 ? (
        <EmptyState icon="chart-line" title={t('admin.noData')} />
      ) : (
        <>
          <View className="flex-row justify-between mb-3">
            <View>
              <Text variant="caption" tone="muted">
                {t('admin.revenueMonth')}
              </Text>
              <Text className="text-lg font-bold text-primary">{fmtMoney(data.totalRevenue)}</Text>
            </View>
            <View className="items-end">
              <Text variant="caption" tone="muted">
                {t('admin.grossProfit')}
              </Text>
              <Text className="text-lg font-bold text-success">{fmtMoney(data.grossProfit)}</Text>
            </View>
          </View>
          <RevenueChart periods={data.periods} />
        </>
      )}
    </Card>
  );
}

function AttendanceToday() {
  const { data, isLoading, isError, refetch } = useTodayAttendance();

  const stats = useMemo(() => {
    const rows = data ?? [];
    return {
      present: rows.reduce((s, r) => s + (r.presentShifts ?? 0), 0),
      late: rows.reduce((s, r) => s + (r.lateCount ?? 0), 0),
      absent: rows.reduce((s, r) => s + (r.absentShifts ?? 0), 0),
    };
  }, [data]);

  return (
    <Card className="p-4">
      <SectionTitle icon="account-clock" title={t('admin.attendanceToday')} hint={dayjs().format('DD/MM')} />
      {isLoading ? (
        <Skeleton width="100%" height={78} radius={12} />
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : (
        <View className="flex-row gap-3">
          <StatCard value={stats.present} label={t('admin.present')} tone="success" />
          <StatCard value={stats.late} label={t('admin.late')} tone="warning" />
          <StatCard value={stats.absent} label={t('admin.absent')} tone="error" />
        </View>
      )}
    </Card>
  );
}

const PAYMENT_LABELS: Record<string, string> = {
  Cash: 'Tiền mặt',
  Card: 'Thẻ',
  Bank: 'Chuyển khoản',
  Transfer: 'Chuyển khoản',
  QR: 'QR',
};

function PaymentMix({ days }: { days: number }) {
  const { data, isLoading } = usePaymentMix(days);

  if (isLoading) return <Skeleton width="100%" height={96} radius={16} />;
  if (!data || data.length === 0) return null;

  return (
    <Card className="p-4">
      <SectionTitle icon="credit-card-multiple" title={t('admin.paymentMix')} />
      <View className="gap-2.5">
        {data.map((row: IPaymentMethodReport) => (
          <View key={row.method} className="gap-1">
            <View className="flex-row justify-between">
              <Text variant="bodySmall">{PAYMENT_LABELS[row.method] ?? row.method}</Text>
              <Text variant="bodySmall" tone="muted">
                {fmtMoney(row.totalAmount)} · {row.percentage.toFixed(0)}%
              </Text>
            </View>
            <View className="h-2 rounded-full bg-surface dark:bg-surface-dark overflow-hidden">
              <View
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, Math.max(2, row.percentage))}%` }}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

function TopProducts() {
  const { data } = useDashboardSummary();
  const items = data?.topSellingProducts ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="p-4">
      <SectionTitle icon="trophy" title={t('admin.topProducts')} />
      <View className="gap-3">
        {items.slice(0, 5).map((p: ITopSellingProduct, i: number) => (
          <View key={p.productId} className="flex-row items-center gap-3">
            <View className="w-7 h-7 rounded-full bg-primary-soft items-center justify-center">
              <Text className="text-primary font-bold text-xs">{i + 1}</Text>
            </View>
            <View className="flex-1">
              <Text variant="bodySmall" numberOfLines={1}>
                {p.productName}
              </Text>
              <Text variant="caption" tone="muted">
                {p.quantitySold} {t('admin.sold')}
              </Text>
            </View>
            <Text variant="bodySmall" className="font-semibold text-primary">
              {fmtCompact(p.revenue)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const ORDER_STATUS_TONE: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  Completed: 'success',
  Paid: 'success',
  Pending: 'warning',
  Processing: 'info',
  Cancelled: 'error',
};

function RecentOrders() {
  const { data } = useDashboardSummary();
  const items = data?.recentOrders ?? [];
  if (items.length === 0) return null;

  return (
    <Card className="p-4">
      <SectionTitle icon="receipt" title={t('admin.recentOrders')} />
      <View className="gap-3">
        {items.slice(0, 6).map((o: IRecentOrder) => (
          <View key={o.id} className="flex-row items-center gap-3">
            <View className="flex-1">
              <Text variant="bodySmall" numberOfLines={1}>
                #{o.orderNumber}
                {o.customerName ? ` · ${o.customerName}` : ''}
              </Text>
              <Text variant="caption" tone="muted">
                {dayjs(o.createdAt).format('DD/MM HH:mm')}
              </Text>
            </View>
            <Text variant="bodySmall" className="font-semibold">
              {fmtMoney(o.totalAmount)}
            </Text>
            <Badge tone={ORDER_STATUS_TONE[o.status] ?? 'info'}>{o.status}</Badge>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ----------------------------------------------------------------------

export function AdminDashboardScreen() {
  const [days, setDays] = useState(7);
  const summary = useDashboardSummary();
  const revenue = useRevenueReport(days);

  const refreshing = summary.isFetching || revenue.isFetching;
  const onRefresh = () => {
    summary.refetch();
    revenue.refetch();
  };

  return (
    <Screen scroll refreshing={refreshing} onRefresh={onRefresh}>
      <AppHeader
        title={t('admin.title')}
        subtitle={t('admin.subtitle')}
        actions={[{ icon: 'bell-outline', onPress: () => router.push('/notifications') }]}
      />

      <SegmentedControl
        segments={[
          { key: '7', label: t('admin.last7Days') },
          { key: '30', label: t('admin.last30Days') },
        ]}
        value={String(days)}
        onChange={(k) => setDays(Number(k))}
      />

      <KpiGrid />
      <RevenueSection days={days} />
      <AttendanceToday />
      <PaymentMix days={days} />
      <TopProducts />
      <RecentOrders />
    </Screen>
  );
}
