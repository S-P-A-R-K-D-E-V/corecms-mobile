import { useState } from 'react';
import { View } from 'react-native';

import { Screen, AppHeader, StatCard, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Icon, Skeleton, SegmentedControl } from 'src/components/ui';
import { RevenueChart } from 'src/features/admin-dashboard/RevenueChart';
import { useRevenueReport, usePaymentMix, fmtMoney, fmtCompact } from 'src/features/admin-dashboard/hooks';
import type { IPaymentMethodReport } from 'src/types/corecms-api';

// ----------------------------------------------------------------------
// Báo cáo doanh thu (Admin): KPI + biểu đồ theo ngày + cơ cấu thanh toán,
// chọn khoảng 7 / 30 / 90 ngày. Dùng chung endpoint /reports/revenue.
// ----------------------------------------------------------------------

const RANGES = [
  { key: '7', label: '7 ngày', days: 7 },
  { key: '30', label: '30 ngày', days: 30 },
  { key: '90', label: '90 ngày', days: 90 },
];

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
      <View className="flex-row items-center gap-2 mb-2">
        <Icon name="credit-card-multiple" size={18} tone="primary" />
        <Text variant="subtitle">Cơ cấu thanh toán</Text>
      </View>
      <View className="gap-2.5">
        {data.map((row: IPaymentMethodReport) => (
          <View key={row.method} className="gap-1">
            <View className="flex-row justify-between">
              <Text variant="bodySmall">{PAYMENT_LABELS[row.method] ?? row.method}</Text>
              <Text variant="bodySmall" tone="muted">{fmtMoney(row.totalAmount)} · {row.percentage.toFixed(0)}%</Text>
            </View>
            <View className="h-2 rounded-full bg-surface dark:bg-surface-dark overflow-hidden">
              <View className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(2, row.percentage))}%` }} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function RevenueReportScreen() {
  const [rangeKey, setRangeKey] = useState('30');
  const days = RANGES.find((r) => r.key === rangeKey)?.days ?? 30;
  const { data, isLoading, isError, refetch, isFetching } = useRevenueReport(days);

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Báo cáo doanh thu" subtitle="Doanh thu · lợi nhuận · đơn hàng" back />

      <SegmentedControl
        segments={RANGES.map((r) => ({ key: r.key, label: r.label }))}
        value={rangeKey}
        onChange={setRangeKey}
      />

      {isLoading ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Skeleton width="48%" height={92} radius={16} />
            <Skeleton width="48%" height={92} radius={16} />
          </View>
          <Skeleton width="100%" height={200} radius={16} />
        </View>
      ) : isError || !data ? (
        <ErrorView onRetry={refetch} />
      ) : (
        <>
          <View className="flex-row gap-3">
            <Card className="flex-1 p-4 gap-1">
              <Text variant="caption" tone="muted">Doanh thu</Text>
              <Text className="text-2xl font-bold text-primary">{fmtCompact(data.totalRevenue)}</Text>
              <Text variant="caption" tone="muted">{data.totalOrders} đơn</Text>
            </Card>
            <Card className="flex-1 p-4 gap-1">
              <Text variant="caption" tone="muted">Lợi nhuận gộp</Text>
              <Text className="text-2xl font-bold text-success">{fmtCompact(data.grossProfit)}</Text>
              <Text variant="caption" tone="muted">Vốn {fmtCompact(data.totalCost)}</Text>
            </Card>
          </View>

          <View className="flex-row gap-3">
            <StatCard value={fmtCompact(data.averageOrderValue)} label="GT đơn TB" tone="info" />
            <StatCard value={data.totalItemsSold} label="SP đã bán" tone="success" />
            <StatCard value={data.totalOrders} label="Tổng đơn" tone="primary" />
          </View>

          <Card className="p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon name="chart-line" size={18} tone="primary" />
              <Text variant="subtitle" className="flex-1">Doanh thu theo ngày</Text>
            </View>
            {data.periods.length === 0 ? (
              <EmptyState icon="chart-line" title="Chưa có dữ liệu trong khoảng này" />
            ) : (
              <RevenueChart periods={data.periods} />
            )}
          </Card>

          <PaymentMix days={days} />
        </>
      )}
    </Screen>
  );
}
