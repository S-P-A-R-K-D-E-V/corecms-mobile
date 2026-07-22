import { useState } from 'react';
import { View } from 'react-native';
import dayjs, { Dayjs } from 'dayjs';

import { Screen, AppHeader, ErrorView } from 'src/components/shared';
import { Card, Text, Icon, Badge, Skeleton, SegmentedControl, ProgressRing, Pressable, Divider } from 'src/components/ui';
import { haptics } from 'src/services/haptics';
import { fmtMoney } from 'src/features/admin-dashboard/hooks';
import { useBreakEvenAnalysis } from './hooks';
import { brand } from 'src/theme';

// ----------------------------------------------------------------------
// Điểm hòa vốn chi tiết (Admin): doanh thu hòa vốn vs thực tế, biên an
// toàn, và chi tiết từng dòng chi phí hoạt động (kèm cờ "ước tính").
// Đồng bộ core-fe report-breakeven-view.tsx.
// ----------------------------------------------------------------------

type Period = 'day' | 'month' | 'year';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'day', label: 'Ngày' },
  { key: 'month', label: 'Tháng' },
  { key: 'year', label: 'Năm' },
];

function fmtPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

function targetLabel(period: Period, target: Dayjs): string {
  if (period === 'day') return target.format('DD/MM/YYYY');
  if (period === 'year') return target.format('YYYY');
  return `Tháng ${target.format('MM/YYYY')}`;
}

function TargetNav({ period, target, onChange }: { period: Period; target: Dayjs; onChange: (next: Dayjs) => void }) {
  const unit = period === 'day' ? 'day' : period === 'year' ? 'year' : 'month';
  const atPresent = target.isSame(dayjs(), unit);

  return (
    <View className="flex-row items-center justify-between">
      <Pressable
        onPress={() => { haptics.selection(); onChange(target.subtract(1, unit)); }}
        hitSlop={8}
        className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark"
      >
        <Icon name="chevron-left" size={20} tone="muted" />
      </Pressable>
      <Text variant="subtitle" className="capitalize">{targetLabel(period, target)}</Text>
      <Pressable
        onPress={() => { haptics.selection(); onChange(target.add(1, unit)); }}
        hitSlop={8}
        disabled={atPresent}
        className="w-9 h-9 items-center justify-center rounded-full bg-surface dark:bg-surface-dark"
        style={atPresent ? { opacity: 0.35 } : undefined}
      >
        <Icon name="chevron-right" size={20} tone="muted" />
      </Pressable>
    </View>
  );
}

export function BreakEvenReportScreen() {
  const [period, setPeriod] = useState<Period>('month');
  const [target, setTarget] = useState(dayjs());
  const targetDate = target.format('YYYY-MM-DD');

  const { data, isLoading, isError, isFetching, refetch } = useBreakEvenAnalysis(period, targetDate);

  const achievedPercent = data && data.breakEvenRevenue > 0
    ? Math.min(999, (data.actualRevenue / data.breakEvenRevenue) * 100)
    : 0;
  const ringColor = achievedPercent >= 100 ? brand.success : brand.error;

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Điểm hòa vốn" subtitle="Doanh thu hòa vốn theo kỳ" back />

      <SegmentedControl
        segments={PERIODS.map((p) => ({ key: p.key, label: p.label }))}
        value={period}
        onChange={(k) => setPeriod(k as Period)}
      />
      <TargetNav period={period} target={target} onChange={setTarget} />
      <Text variant="caption" tone="muted">
        Tỷ lệ COGS tự tính từ dữ liệu bán hàng KiotViet (trailing). Chi phí hoạt động lấy từ tất cả danh mục chi
        phí (trừ khoản thu) đã nhập trong kỳ, phân bổ theo ngày với chi phí định kỳ.
      </Text>

      {isLoading ? (
        <View className="gap-3">
          <Skeleton width="100%" height={140} radius={16} />
          <Skeleton width="100%" height={220} radius={16} />
        </View>
      ) : isError || !data ? (
        <ErrorView onRetry={refetch} />
      ) : (
        <>
          <Card className="p-4 items-center gap-2">
            <ProgressRing size={130} stroke={12} progress={Math.min(100, achievedPercent) / 100} color={ringColor}>
              <Text className="text-2xl font-bold" style={{ color: ringColor }}>
                {achievedPercent.toFixed(0)}%
              </Text>
            </ProgressRing>
            <Text variant="bodySmall" tone="muted" className="text-center">
              Doanh thu thực tế / Doanh thu hòa vốn
            </Text>
          </Card>

          <View className="flex-row gap-3">
            <Card className="flex-1 p-4 gap-1">
              <Text variant="caption" tone="muted">Doanh thu hòa vốn</Text>
              <Text className="text-lg font-bold">{fmtMoney(data.breakEvenRevenue)}</Text>
            </Card>
            <Card className="flex-1 p-4 gap-1">
              <Text variant="caption" tone="muted">Doanh thu thực tế</Text>
              <Text className="text-lg font-bold text-primary">{fmtMoney(data.actualRevenue)}</Text>
            </Card>
          </View>
          <View className="flex-row gap-3">
            <Card className="flex-1 p-4 gap-1">
              <Text variant="caption" tone="muted">Chi phí hoạt động (kỳ)</Text>
              <Text className="text-lg font-bold">{fmtMoney(data.fixedCosts)}</Text>
            </Card>
            <Card className="flex-1 p-4 gap-1">
              <Text variant="caption" tone="muted">Tỷ lệ COGS (trailing)</Text>
              <Text className="text-lg font-bold">{fmtPercent(data.cogsRatio * 100)}</Text>
            </Card>
          </View>
          <Card className="p-4 gap-1">
            <Text variant="caption" tone="muted">Biên độ an toàn (Margin of Safety)</Text>
            <Text className={`text-xl font-bold ${data.gap >= 0 ? 'text-success' : 'text-error'}`}>
              {data.gap >= 0 ? '+' : ''}
              {fmtMoney(data.gap)}
            </Text>
          </Card>

          <Card className="p-4 gap-3">
            <View className="flex-row items-center gap-2">
              <Text variant="subtitle" className="flex-1">Chi tiết chi phí hoạt động</Text>
              {data.operatingCost?.hasEstimates ? (
                <Badge tone="warning">Có khoản ước tính</Badge>
              ) : null}
            </View>

            <View className="gap-2.5">
              {data.operatingCost?.lines?.map((line, idx) => (
                <View key={idx} className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-1.5 flex-1">
                    <Text variant="bodySmall" numberOfLines={1} className="flex-1">{line.label}</Text>
                    {line.isEstimated ? <Badge tone="warning" variant="soft">ước tính</Badge> : null}
                  </View>
                  <Text
                    variant="bodySmall"
                    className={`font-semibold ${line.isEstimated ? 'text-warning-text' : ''}`}
                  >
                    {fmtMoney(line.amount)}
                  </Text>
                </View>
              ))}

              {(!data.operatingCost?.lines || data.operatingCost.lines.length === 0) && (
                <Text variant="bodySmall" tone="muted">Chưa có chi phí nào trong kỳ.</Text>
              )}
            </View>

            <Divider />
            <View className="flex-row items-center justify-between">
              <Text variant="subtitle">Tổng chi phí hoạt động</Text>
              <Text variant="subtitle">{fmtMoney(data.operatingCost?.total ?? data.fixedCosts)}</Text>
            </View>

            {data.operatingCost?.hasEstimates ? (
              <Text variant="caption" tone="muted">
                Khoản &quot;ước tính&quot; gồm: chi phí định kỳ chưa được sinh, lương kỳ chưa chốt (suy từ kỳ
                lương gần nhất), và chi phí biến đổi chưa nhập (trung bình mùa vụ). Con số thực tế thay thế ước
                tính khi dữ liệu được nhập/chốt.
              </Text>
            ) : null}
          </Card>
        </>
      )}
    </Screen>
  );
}
