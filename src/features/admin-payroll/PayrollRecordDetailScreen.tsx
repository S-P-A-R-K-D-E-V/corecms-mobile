import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Icon, Pressable, Skeleton, Divider } from 'src/components/ui';
import { AdjustAttendanceSheet, type AdjustTarget } from 'src/features/manage/AdjustAttendanceSheet';
import type { IPayrollShiftItem } from 'src/types/corecms-api';

import { usePayrollShiftDetails } from './hooks';

// ----------------------------------------------------------------------
// Chi tiết bảng lương 1 nhân viên: liệt kê TỪNG CA đi làm (giờ vào/ra, công,
// muộn, trạng thái). Chạm 1 ca → điều chỉnh giờ chấm công (Admin/Manager).
// ----------------------------------------------------------------------

const STATUS_META: Record<string, { tone: 'success' | 'error' | 'warning' | 'info'; label: string }> = {
  Present: { tone: 'success', label: 'Có mặt' },
  Absent: { tone: 'error', label: 'Vắng' },
  Wrong: { tone: 'warning', label: 'Sai ca' },
};

function ShiftItem({ item, staffId, staffName, onAdjust }: {
  item: IPayrollShiftItem;
  staffId: string;
  staffName: string;
  onAdjust: (t: AdjustTarget) => void;
}) {
  const meta = STATUS_META[item.status] ?? { tone: 'info' as const, label: item.status };
  return (
    <Pressable
      onPress={() =>
        onAdjust({
          shiftAssignmentId: item.shiftAssignmentId,
          staffId,
          staffName,
          shiftName: item.shiftName,
          date: dayjs(item.date).format('YYYY-MM-DD'),
          startTime: item.shiftStartTime,
          endTime: item.shiftEndTime,
          checkInTime: item.checkInTime,
          checkOutTime: item.checkOutTime,
        })
      }
      className="py-2.5 gap-1"
    >
      <View className="flex-row items-center justify-between">
        <Text variant="subtitle" className="text-[15px]">{dayjs(item.date).format('DD/MM')} · {item.shiftName}</Text>
        <View className="flex-row items-center gap-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Icon name="pencil-outline" size={15} tone="faint" />
        </View>
      </View>
      <View className="flex-row flex-wrap gap-x-3 gap-y-0.5">
        <Text variant="caption" tone="muted">
          {item.checkInTime ? `Vào ${dayjs(item.checkInTime).format('HH:mm')}` : 'Chưa vào'}
          {item.checkOutTime ? ` · Ra ${dayjs(item.checkOutTime).format('HH:mm')}` : ''}
        </Text>
        <Text variant="caption" tone="muted">Ca {item.shiftStartTime}–{item.shiftEndTime}</Text>
        <Text variant="caption" tone="muted">{item.workedHours.toFixed(1)}h</Text>
        {item.lateMinutes > 0 ? <Text variant="caption" tone="warning">Muộn {item.lateMinutes}p</Text> : null}
        {item.isHolidayShift ? <Text variant="caption" tone="primary">Ngày lễ</Text> : null}
      </View>
    </Pressable>
  );
}

export function PayrollRecordDetailScreen() {
  const params = useLocalSearchParams<{ recordId: string; userName?: string }>();
  const recordId = params.recordId;
  const { data, isLoading, isError, refetch, isFetching } = usePayrollShiftDetails(recordId);
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader
        title={data?.userName ?? params.userName ?? 'Chi tiết lương'}
        subtitle={data ? `${dayjs(data.fromDate).format('DD/MM')} – ${dayjs(data.toDate).format('DD/MM/YYYY')} · ${data.shifts.length} ca` : 'Từng ca đi làm'}
        back
      />

      {isLoading ? (
        <Card className="p-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} width="100%" height={40} radius={10} />)}
        </Card>
      ) : isError || !data ? (
        <ErrorView onRetry={refetch} />
      ) : data.shifts.length === 0 ? (
        <EmptyState icon="calendar-blank-outline" title="Không có ca" description="Bảng lương này chưa có ca nào." />
      ) : (
        <Card className="p-4">
          <View className="flex-row items-center gap-2 mb-1">
            <Icon name="calendar-clock" size={18} tone="primary" />
            <Text variant="subtitle" className="flex-1">Các ca đi làm</Text>
            <Text variant="caption" tone="muted">Chạm để chỉnh giờ</Text>
          </View>
          {data.shifts.map((s, i) => (
            <View key={s.shiftAssignmentId + s.date}>
              {i > 0 ? <Divider /> : null}
              <ShiftItem item={s} staffId={data.userId} staffName={data.userName} onAdjust={setAdjust} />
            </View>
          ))}
        </Card>
      )}

      <AdjustAttendanceSheet target={adjust} visible={!!adjust} onClose={() => setAdjust(null)} />
    </Screen>
  );
}
