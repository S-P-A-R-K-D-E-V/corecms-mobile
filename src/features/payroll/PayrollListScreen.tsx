import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Icon, Pressable, Appear, Skeleton } from 'src/components/ui';
import { WalletIllustration } from 'src/components/illustrations';
import type { IPayrollRecord } from 'src/types/corecms-api';
import { useMyPayroll, fmtMoney } from './hooks';
import { t } from 'src/i18n';

function PayrollSkeleton() {
  return (
    <View className="gap-3">
      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-4 gap-3">
          <View className="flex-row items-center justify-between">
            <Skeleton width={150} height={16} />
            <Skeleton width={64} height={22} radius={11} />
          </View>
          <Skeleton width={130} height={28} />
          <Skeleton width="65%" height={12} />
        </Card>
      ))}
    </View>
  );
}

function PayrollCard({ rec }: { rec: IPayrollRecord }) {
  return (
    <Pressable onPress={() => router.push(`/(tabs)/payroll/${rec.id}`)}>
      <Card className="p-4 gap-3">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text variant="subtitle">{rec.cycleName}</Text>
            <Text variant="bodySmall" tone="muted">
              {dayjs(rec.periodStart).format('DD/MM')} – {dayjs(rec.periodEnd).format('DD/MM/YYYY')}
            </Text>
          </View>
          <Badge tone={rec.status === 'Finalized' ? 'success' : 'warning'}>
            {rec.status === 'Finalized' ? 'Đã chốt' : 'Tạm tính'}
          </Badge>
        </View>

        <View className="flex-row items-end justify-between">
          <View>
            <Text variant="caption" tone="muted">Thực nhận</Text>
            <Text className="text-2xl font-bold text-primary">{fmtMoney(rec.totalSalary)}</Text>
          </View>
          <Icon name="chevron-right" size={22} tone="faint" />
        </View>

        <View className="flex-row gap-4 pt-1">
          <View className="flex-row items-center gap-1">
            <Icon name="check-circle-outline" size={14} tone="success" />
            <Text variant="caption" tone="muted">{rec.totalShiftsPresent} ca</Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Icon name="clock-outline" size={14} tone="info" />
            <Text variant="caption" tone="muted">{rec.totalHoursWorked}h</Text>
          </View>
          {rec.totalOvertimeHours > 0 ? (
            <View className="flex-row items-center gap-1">
              <Icon name="lightning-bolt" size={14} tone="warning" />
              <Text variant="caption" tone="muted">OT {rec.totalOvertimeHours}h</Text>
            </View>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

export function PayrollListScreen() {
  const { data, isLoading, isError, refetch, isFetching } = useMyPayroll();

  return (
    <Screen scroll refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title={t('tabs.payroll')} subtitle="Bảng lương của bạn" />
      {isLoading ? (
        <PayrollSkeleton />
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState illustration={<WalletIllustration />} title="Chưa có bảng lương" description="Bảng lương sẽ hiển thị khi kỳ lương được tạo." />
      ) : (
        data
          .slice()
          .sort((a, b) => dayjs(b.periodStart).diff(dayjs(a.periodStart)))
          .map((rec, i) => (
            <Appear key={rec.id} index={i}>
              <PayrollCard rec={rec} />
            </Appear>
          ))
      )}
    </Screen>
  );
}
