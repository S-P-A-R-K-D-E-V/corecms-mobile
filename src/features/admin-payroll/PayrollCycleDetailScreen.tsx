import { useMemo } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, StatCard, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Skeleton, Divider } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { fmtMoney, fmtCompact } from 'src/features/admin-dashboard/hooks';
import type { IPayrollRecord } from 'src/types/corecms-api';

import { usePayrollByCycle, useRecalculateCycle } from './hooks';

// ----------------------------------------------------------------------
// Chi tiết chu kỳ lương (Admin): tổng quan (tự tính từ records) + bảng lương
// theo nhân viên; nút "Tính lại toàn kỳ" (recalculate-cycle).
// ----------------------------------------------------------------------

function RecordCard({ r }: { r: IPayrollRecord }) {
  return (
    <View className="py-3 gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>{r.userName}</Text>
        <Text className="text-lg font-bold text-primary">{fmtMoney(r.totalSalary)}</Text>
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1">
          <Icon name="check-circle-outline" size={13} tone="success" />
          <Text variant="caption" tone="muted">{r.presentShifts}/{r.totalShifts} ca · {r.totalHoursWorked.toFixed(1)}h</Text>
        </View>
        {r.bonus > 0 ? (
          <View className="flex-row items-center gap-1">
            <Icon name="gift-outline" size={13} tone="info" />
            <Text variant="caption" tone="muted">Thưởng {fmtCompact(r.bonus)}</Text>
          </View>
        ) : null}
        {r.penaltyAmount > 0 ? (
          <View className="flex-row items-center gap-1">
            <Icon name="alert-circle-outline" size={13} tone="warning" />
            <Text variant="caption" tone="muted">Phạt {fmtCompact(r.penaltyAmount)}</Text>
          </View>
        ) : null}
      </View>
      <View className="flex-row items-center justify-between">
        <Text variant="caption" tone="muted">Cơ bản {fmtCompact(r.baseSalary)}{r.overtimeSalary > 0 ? ` · OT ${fmtCompact(r.overtimeSalary)}` : ''}</Text>
        <Badge tone={r.isFinalized ? 'success' : 'warning'}>{r.isFinalized ? 'Đã chốt' : 'Tạm tính'}</Badge>
      </View>
    </View>
  );
}

export function PayrollCycleDetailScreen() {
  const params = useLocalSearchParams<{ cycleId: string; name?: string }>();
  const cycleId = params.cycleId;
  const { data, isLoading, isError, refetch, isFetching } = usePayrollByCycle(cycleId);
  const recalcM = useRecalculateCycle();

  const totals = useMemo(() => {
    const records = data?.records ?? [];
    return {
      count: records.length,
      total: records.reduce((s, r) => s + r.totalSalary, 0),
      finalized: records.filter((r) => r.isFinalized).length,
    };
  }, [data]);

  async function recalc() {
    if (!cycleId) return;
    const ok = await confirm({
      title: 'Tính lại toàn kỳ',
      message: 'Tính lại bảng lương cho toàn bộ nhân viên trong chu kỳ này?',
      confirmText: 'Tính lại',
    });
    if (!ok) return;
    try {
      const res = await recalcM.mutateAsync(cycleId);
      haptics.success();
      toast.success(`Đã tính lại ${res.successCount} nhân viên.`, 'Hoàn tất');
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không tính lại được');
    }
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader
        title={data?.cycleName ?? params.name ?? 'Bảng lương'}
        subtitle={data ? `${dayjs(data.fromDate).format('DD/MM')} – ${dayjs(data.toDate).format('DD/MM/YYYY')}` : 'Chi tiết chu kỳ'}
        back
      />

      {isLoading ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Skeleton width="31%" height={78} radius={16} />
            <Skeleton width="31%" height={78} radius={16} />
            <Skeleton width="31%" height={78} radius={16} />
          </View>
          <Skeleton width="100%" height={240} radius={16} />
        </View>
      ) : isError || !data ? (
        <ErrorView onRetry={refetch} />
      ) : (
        <>
          <View className="flex-row gap-3">
            <StatCard value={totals.count} label="Nhân viên" tone="info" />
            <StatCard value={fmtCompact(totals.total)} label="Tổng chi lương" tone="primary" />
            <StatCard value={`${totals.finalized}/${totals.count}`} label="Đã chốt" tone={totals.finalized === totals.count && totals.count > 0 ? 'success' : 'warning'} />
          </View>

          {!data.isLocked ? (
            <Button variant="soft" fullWidth icon="calculator-variant-outline" loading={recalcM.isPending} onPress={recalc}>
              Tính lại toàn kỳ
            </Button>
          ) : (
            <View className="flex-row items-center gap-2 px-3.5 py-2.5 rounded-xl bg-error-soft">
              <Icon name="lock-outline" size={16} tone="error" />
              <Text variant="bodySmall" tone="error" className="font-semibold">Chu kỳ đã khoá — không thể tính lại.</Text>
            </View>
          )}

          {data.records.length === 0 ? (
            <EmptyState icon="cash-remove" title="Chưa có bảng lương" description="Chu kỳ này chưa tính lương nhân viên nào." />
          ) : (
            <Card className="p-4">
              <View className="flex-row items-center gap-2 mb-1">
                <Icon name="account-cash-outline" size={18} tone="primary" />
                <Text variant="subtitle" className="flex-1">Lương theo nhân viên</Text>
                <Badge tone="info">{data.records.length}</Badge>
              </View>
              {data.records.map((r, i) => (
                <View key={r.id}>
                  {i > 0 ? <Divider /> : null}
                  <RecordCard r={r} />
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}
