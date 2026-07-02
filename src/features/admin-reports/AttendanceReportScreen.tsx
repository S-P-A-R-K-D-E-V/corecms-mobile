import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, AppHeader, StatCard, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Icon, Skeleton, SegmentedControl, Divider } from 'src/components/ui';
import type { IAttendanceReport } from 'src/types/corecms-api';

import { useAttendanceReport } from './hooks';

// ----------------------------------------------------------------------
// Báo cáo chấm công (Admin): gộp theo nhân viên trong khoảng 7/30/90 ngày.
// Tổng quan trên đầu + danh sách từng NV (giờ công, vắng, muộn, tăng ca),
// sắp NV "có vấn đề" (vắng/muộn) lên trước.
// ----------------------------------------------------------------------

const RANGES = [
  { key: '7', label: '7 ngày', days: 7 },
  { key: '30', label: '30 ngày', days: 30 },
  { key: '90', label: '90 ngày', days: 90 },
];

function StaffRow({ r }: { r: IAttendanceReport }) {
  return (
    <View className="py-2.5 gap-1.5">
      <View className="flex-row items-center justify-between">
        <Text variant="subtitle" className="flex-1" numberOfLines={1}>{r.staffName}</Text>
        <Text variant="bodySmall" className="font-semibold text-primary">{r.totalWorkedHours.toFixed(1)}h</Text>
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-1">
        <View className="flex-row items-center gap-1">
          <Icon name="check-circle-outline" size={13} tone="success" />
          <Text variant="caption" tone="muted">{r.presentShifts}/{r.totalShifts} ca</Text>
        </View>
        {r.absentShifts > 0 ? (
          <View className="flex-row items-center gap-1">
            <Icon name="close-circle" size={13} tone="error" />
            <Text variant="caption" tone="muted">Vắng {r.absentShifts}</Text>
          </View>
        ) : null}
        {r.lateCount > 0 ? (
          <View className="flex-row items-center gap-1">
            <Icon name="alert-circle-outline" size={13} tone="warning" />
            <Text variant="caption" tone="muted">Muộn {r.lateCount} ({r.totalLateMinutes}p)</Text>
          </View>
        ) : null}
        {r.overtimeHours > 0 ? (
          <View className="flex-row items-center gap-1">
            <Icon name="clock-plus-outline" size={13} tone="info" />
            <Text variant="caption" tone="muted">OT {r.overtimeHours.toFixed(1)}h</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function AttendanceReportScreen() {
  const [rangeKey, setRangeKey] = useState('30');
  const days = RANGES.find((r) => r.key === rangeKey)?.days ?? 30;
  const { data, isLoading, isError, refetch, isFetching } = useAttendanceReport(days);

  const { rows, totals } = useMemo(() => {
    const list = [...(data ?? [])].sort(
      (a, b) => b.absentShifts - a.absentShifts || b.lateCount - a.lateCount || b.totalWorkedHours - a.totalWorkedHours
    );
    const t = list.reduce(
      (acc, r) => ({
        hours: acc.hours + r.totalWorkedHours,
        absent: acc.absent + r.absentShifts,
        late: acc.late + r.lateCount,
      }),
      { hours: 0, absent: 0, late: 0 }
    );
    return { rows: list, totals: t };
  }, [data]);

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Báo cáo chấm công" subtitle="Công · vắng · muộn theo nhân viên" back />

      <SegmentedControl
        segments={RANGES.map((r) => ({ key: r.key, label: r.label }))}
        value={rangeKey}
        onChange={setRangeKey}
      />

      {isLoading ? (
        <View className="gap-3">
          <View className="flex-row gap-3">
            <Skeleton width="31%" height={78} radius={16} />
            <Skeleton width="31%" height={78} radius={16} />
            <Skeleton width="31%" height={78} radius={16} />
          </View>
          <Skeleton width="100%" height={220} radius={16} />
        </View>
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState icon="clipboard-text-clock" title="Chưa có dữ liệu" description="Không có ca nào được phân trong khoảng này." />
      ) : (
        <>
          <View className="flex-row gap-3">
            <StatCard value={totals.hours.toFixed(0)} label="Tổng giờ công" tone="primary" />
            <StatCard value={totals.absent} label="Lượt vắng" tone={totals.absent > 0 ? 'error' : 'success'} />
            <StatCard value={totals.late} label="Lượt muộn" tone={totals.late > 0 ? 'warning' : 'success'} />
          </View>

          <Card className="p-4">
            <View className="flex-row items-center gap-2 mb-1">
              <Icon name="account-group" size={18} tone="primary" />
              <Text variant="subtitle" className="flex-1">Theo nhân viên</Text>
              <Badge tone="info">{rows.length}</Badge>
            </View>
            {rows.map((r, i) => (
              <View key={r.staffId}>
                {i > 0 ? <Divider /> : null}
                <StaffRow r={r} />
              </View>
            ))}
          </Card>
        </>
      )}
    </Screen>
  );
}
