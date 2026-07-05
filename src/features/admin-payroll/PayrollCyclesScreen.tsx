import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Pressable, Skeleton } from 'src/components/ui';
import type { IPayrollCycle } from 'src/types/corecms-api';

import { usePayrollCycles } from './hooks';
import { CreateCycleSheet } from './CreateCycleSheet';

// ----------------------------------------------------------------------
// Danh sách chu kỳ lương (Admin). Nút "Tạo chu kỳ" mở sheet (tạo trống hoặc
// tạo + tính lương). Chạm 1 chu kỳ → xem bảng lương theo nhân viên.
// ----------------------------------------------------------------------

function CycleCard({ cycle }: { cycle: IPayrollCycle }) {
  return (
    <Pressable onPress={() => router.push({ pathname: '/admin/payroll-detail' as any, params: { cycleId: cycle.id, name: cycle.name } })}>
      <Card className="p-4 gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <Text variant="subtitle" className="flex-1" numberOfLines={1}>{cycle.name}</Text>
          <Badge tone={cycle.isVisibleToStaff ? 'info' : 'warning'}>
            {cycle.isVisibleToStaff ? 'NV xem được' : 'Ẩn với NV'}
          </Badge>
          <Badge tone={cycle.isLocked ? 'error' : 'success'}>{cycle.isLocked ? 'Đã khoá' : 'Mở'}</Badge>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Icon name="calendar-range" size={14} tone="muted" />
            <Text variant="caption" tone="muted">
              {dayjs(cycle.fromDate).format('DD/MM')} – {dayjs(cycle.toDate).format('DD/MM/YYYY')}
            </Text>
          </View>
          <View className="flex-row items-center gap-1">
            <Icon name="calendar-check" size={14} tone="muted" />
            <Text variant="caption" tone="muted">{cycle.standardWorkDays} công</Text>
          </View>
          <Badge tone="info">{cycle.cycleType === 'Monthly' ? 'Theo tháng' : 'Tùy chỉnh'}</Badge>
        </View>
        <View className="flex-row items-center justify-end gap-1">
          <Text variant="caption" tone="primary" className="font-semibold">Xem bảng lương</Text>
          <Icon name="chevron-right" size={16} tone="primary" />
        </View>
      </Card>
    </Pressable>
  );
}

export function PayrollCyclesScreen() {
  const { data, isLoading, isError, refetch, isFetching } = usePayrollCycles();
  const [creating, setCreating] = useState(false);

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader
        title="Chu kỳ lương"
        subtitle="Tạo chu kỳ & tính lương nhân viên"
        back
        actions={[{ icon: 'plus', onPress: () => setCreating(true) }]}
      />

      <Button fullWidth icon="plus" onPress={() => setCreating(true)}>Tạo chu kỳ lương</Button>

      {isLoading ? (
        <View className="gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={104} radius={16} />)}
        </View>
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon="cash-multiple" title="Chưa có chu kỳ lương" description="Nhấn “Tạo chu kỳ lương” để bắt đầu tính lương." />
      ) : (
        data.map((c) => <CycleCard key={c.id} cycle={c} />)
      )}

      <CreateCycleSheet
        visible={creating}
        onClose={() => setCreating(false)}
        onGenerated={(cycleId) => router.push({ pathname: '/admin/payroll-detail' as any, params: { cycleId } })}
      />
    </Screen>
  );
}
