import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Pressable, Skeleton, Divider } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { AdjustAttendanceSheet, type AdjustTarget } from 'src/features/manage/AdjustAttendanceSheet';
import type { IPayrollShiftItem, ISalaryConfiguration } from 'src/types/corecms-api';

import { usePayrollShiftDetails, useUserSalaryConfigs, useRecalculateRecord, useFinalizePayroll } from './hooks';
import { SalaryConfigSheet } from './SalaryConfigSheet';

// ----------------------------------------------------------------------
// Chi tiết bảng lương 1 nhân viên: cấu hình lương cá nhân + tính lại + chốt;
// liệt kê TỪNG CA đi làm (giờ vào/ra, công, muộn, trạng thái). Chạm 1 ca →
// điều chỉnh giờ chấm công (Admin/Manager).
// ----------------------------------------------------------------------

const SALARY_UNIT: Record<string, string> = { PerShift: 'đ/ca', Hourly: 'đ/giờ', Monthly: 'đ/tháng' };

/** Cấu hình lương đang hiệu lực hôm nay (effectiveFrom lớn nhất ≤ hôm nay). */
function activeConfig(list: ISalaryConfiguration[] | undefined): ISalaryConfiguration | null {
  if (!list || list.length === 0) return null;
  const today = dayjs().format('YYYY-MM-DD');
  const eligible = list
    .filter((c) => c.effectiveFrom.slice(0, 10) <= today)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return eligible[0] ?? list[0];
}

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
  const params = useLocalSearchParams<{ recordId: string; userName?: string; finalized?: string }>();
  const recordId = params.recordId;
  const { data, isLoading, isError, refetch, isFetching } = usePayrollShiftDetails(recordId);
  const salaryQ = useUserSalaryConfigs(data?.userId);
  const recalcM = useRecalculateRecord();
  const finalizeM = useFinalizePayroll();

  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  // Trạng thái chốt: khởi tạo từ param, cập nhật sau khi thao tác.
  const [finalized, setFinalized] = useState(params.finalized === 'true');

  const config = useMemo(() => activeConfig(salaryQ.data), [salaryQ.data]);

  async function recalc() {
    if (!recordId) return;
    const ok = await confirm({
      title: 'Tính lại lương',
      message: `Tính lại bảng lương của "${data?.userName}" theo cấu hình hiện tại? (chuyển về trạng thái chờ duyệt)`,
      confirmText: 'Tính lại',
    });
    if (!ok) return;
    try {
      await recalcM.mutateAsync(recordId);
      setFinalized(false);
      haptics.success();
      toast.success('Đã tính lại lương.', 'Hoàn tất');
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không tính lại được');
    }
  }

  async function toggleFinalize() {
    if (!recordId) return;
    const next = !finalized;
    const ok = await confirm({
      title: next ? 'Chốt lương' : 'Bỏ chốt',
      message: next
        ? `Chốt bảng lương của "${data?.userName}"? Sau khi chốt sẽ khoá khỏi chỉnh sửa.`
        : `Bỏ chốt bảng lương của "${data?.userName}" để chỉnh sửa lại?`,
      confirmText: next ? 'Chốt lương' : 'Bỏ chốt',
    });
    if (!ok) return;
    try {
      await finalizeM.mutateAsync({ id: recordId, data: { isFinalized: next } });
      setFinalized(next);
      haptics.success();
      toast.success(next ? 'Đã chốt lương.' : 'Đã bỏ chốt.', 'Cập nhật');
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không cập nhật được');
    }
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader
        title={data?.userName ?? params.userName ?? 'Chi tiết lương'}
        subtitle={data ? `${dayjs(data.fromDate).format('DD/MM')} – ${dayjs(data.toDate).format('DD/MM/YYYY')} · ${data.shifts.length} ca` : 'Từng ca đi làm'}
        back
      />

      {/* Cấu hình lương + hành động */}
      {data ? (
        <Card className="p-4 gap-3">
          <View className="flex-row items-center gap-2">
            <Icon name="cash-multiple" size={18} tone="primary" />
            <Text variant="subtitle" className="flex-1">Cấu hình lương</Text>
            <Badge tone={finalized ? 'success' : 'warning'}>{finalized ? 'Đã chốt' : 'Tạm tính'}</Badge>
          </View>

          {salaryQ.isLoading ? (
            <Skeleton width="70%" height={16} />
          ) : config ? (
            <Text variant="bodySmall">
              <Text className="font-semibold text-primary">{Number(config.amount).toLocaleString('vi-VN')} {SALARY_UNIT[config.salaryType] ?? ''}</Text>
              {config.probationRate != null ? ` · thử việc ${config.probationRate}%` : ''} · từ {dayjs(config.effectiveFrom).format('DD/MM/YYYY')}
            </Text>
          ) : (
            <Text variant="bodySmall" tone="warning">Chưa có cấu hình lương — hãy đặt mức trước khi tính.</Text>
          )}

          <Button variant="soft" size="sm" icon="cog-outline" disabled={finalized} onPress={() => setConfigOpen(true)}>
            {config ? 'Sửa cấu hình lương' : 'Đặt cấu hình lương'}
          </Button>

          <View className="flex-row gap-2">
            <Button variant="soft" action="neutral" size="sm" className="flex-1" icon="calculator-variant-outline" disabled={finalized} loading={recalcM.isPending} onPress={recalc}>
              Tính lại lương
            </Button>
            <Button size="sm" className="flex-1" action={finalized ? 'error' : 'primary'} variant={finalized ? 'soft' : 'solid'} icon={finalized ? 'lock-open-variant-outline' : 'lock-check-outline'} loading={finalizeM.isPending} onPress={toggleFinalize}>
              {finalized ? 'Bỏ chốt' : 'Chốt lương'}
            </Button>
          </View>
        </Card>
      ) : null}

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

      {data ? (
        <SalaryConfigSheet
          userId={data.userId}
          userName={data.userName}
          current={config}
          visible={configOpen}
          onClose={() => setConfigOpen(false)}
          onSaved={() => salaryQ.refetch()}
        />
      ) : null}
    </Screen>
  );
}
