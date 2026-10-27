import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Badge, Icon, Pressable } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import { getInspectionShifts, getOpenInspectionFaults, startInspection } from 'src/api/inspection';
import type { IInspectionShift, InspectionType } from 'src/types/inspection';
import { canQuickCheck } from './inspection-access';

// ----------------------------------------------------------------------
// Kiểm tra cửa hàng — ca trong ngày + tình trạng kiểm. Trưởng ca (đang trong ca) hoặc người có inspection.conduct:
// "Kiểm nhanh"; inspection.spot: "Đột xuất" / "Kiểm tuần". Ai cũng thấy lối vào "Lỗi của tôi". Bảng kiểm, lịch sử,
// bản đồ lỗi làm trên web.
// ----------------------------------------------------------------------

function ShiftCard({
  shift,
  canConduct,
  canSpot,
  starting,
  onStart,
}: {
  shift: IInspectionShift;
  canConduct: boolean;
  canSpot: boolean;
  starting: string | null;
  onStart: (shift: IInspectionShift, type: InspectionType, spot: boolean) => void;
}) {
  const quick = canQuickCheck(shift, canConduct);
  const busy = starting?.startsWith(shift.shiftScheduleId) ?? false;

  return (
    <SectionCard
      title={`${shift.shiftName} · ${shift.startTime}–${shift.endTime}`}
      icon="clipboard-check-outline"
      right={
        shift.quickStatus === 'Submitted' ? (
          <Badge tone="success">Đã kiểm</Badge>
        ) : shift.quickStatus === 'Draft' ? (
          <Badge tone="warning">Đang kiểm</Badge>
        ) : (
          <Badge tone="neutral">Chưa kiểm</Badge>
        )
      }
      bodyClassName="pt-0 gap-2"
    >
      <Text variant="caption" tone="muted">
        {shift.staffCount} người · Trưởng ca: {shift.shiftLeadName ?? 'chưa đặt'}
        {shift.iAmShiftLead ? ' (bạn)' : ''}
        {shift.spotChecks > 0 ? ` · ${shift.spotChecks} lần đột xuất` : ''}
      </Text>
      {quick ? (
        <Button
          icon="clipboard-check-outline"
          loading={busy && starting?.endsWith(':quick')}
          disabled={!!starting}
          onPress={() => onStart(shift, 'ShiftQuick', false)}
        >
          {shift.quickInspectionId ? (shift.quickStatus === 'Submitted' ? 'Xem kết quả kiểm nhanh' : 'Tiếp tục kiểm nhanh') : 'Kiểm nhanh ca này'}
        </Button>
      ) : shift.quickInspectionId && shift.quickStatus === 'Submitted' ? (
        <Button variant="outline" onPress={() => router.push(`/inspection/run/${shift.quickInspectionId}` as any)}>
          Xem kết quả kiểm nhanh
        </Button>
      ) : null}
      {canSpot ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              size="sm"
              variant="outline"
              loading={busy && starting?.endsWith(':spot')}
              disabled={!!starting}
              onPress={() => onStart(shift, 'ShiftQuick', true)}
            >
              Kiểm đột xuất
            </Button>
          </View>
          <View className="flex-1">
            <Button
              size="sm"
              variant="outline"
              loading={busy && starting?.endsWith(':weekly')}
              disabled={!!starting}
              onPress={() => onStart(shift, 'WeeklyFull', false)}
            >
              Kiểm tuần
            </Button>
          </View>
        </View>
      ) : null}
    </SectionCard>
  );
}

export function InspectionHomeScreen() {
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [starting, setStarting] = useState<string | null>(null);
  const canConduct = hasPermission(user, PERMISSIONS.inspection.conduct);
  const canSpot = hasPermission(user, PERMISSIONS.inspection.spot);

  const shifts = useQuery({ queryKey: ['inspection', 'shifts', date], queryFn: () => getInspectionShifts(date) });
  // Cùng key với tab "Đang mở" của màn lỗi và thẻ ở trang chủ → dùng chung cache.
  const faults = useQuery({ queryKey: ['inspection', 'faults', 'open'], queryFn: () => getOpenInspectionFaults('mine') });
  const openFaults = faults.data?.filter((f) => !f.fixedAt) ?? [];
  const overdue = openFaults.filter((f) => f.isOverdue).length;

  async function onStart(shift: IInspectionShift, type: InspectionType, spot: boolean) {
    // Lượt kiểm nhanh đã có (của ca này) → mở lại, không tạo mới.
    if (type === 'ShiftQuick' && !spot && shift.quickInspectionId) {
      router.push(`/inspection/run/${shift.quickInspectionId}` as any);
      return;
    }
    setStarting(`${shift.shiftScheduleId}:${spot ? 'spot' : type === 'WeeklyFull' ? 'weekly' : 'quick'}`);
    try {
      const inspection = await startInspection(type, shift.date, shift.shiftScheduleId, spot);
      qc.invalidateQueries({ queryKey: ['inspection', 'shifts'] });
      router.push(`/inspection/run/${inspection.summary.id}` as any);
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa bắt đầu được');
    } finally {
      setStarting(null);
    }
  }

  const list = shifts.data ?? [];

  return (
    <Screen scroll refreshing={shifts.isFetching} onRefresh={() => Promise.all([shifts.refetch(), faults.refetch()])}>
      <AppHeader title="Kiểm tra cửa hàng" back />

      <Pressable onPress={() => router.push('/inspection/faults' as any)}>
        <SectionCard
          title="Lỗi của tôi"
          icon="alert-circle-outline"
          right={<Icon name="chevron-right" size={18} tone="muted" />}
          bodyClassName="pt-0"
        >
          <Text variant="bodySmall" tone={openFaults.length > 0 ? (overdue > 0 ? 'error' : 'warning') : 'muted'}>
            {faults.isLoading
              ? 'Đang tải…'
              : openFaults.length > 0
                ? `${openFaults.length} lỗi cần sửa${overdue > 0 ? ` · ${overdue} quá hạn` : ''}`
                : 'Không có lỗi nào đang mở.'}
          </Text>
        </SectionCard>
      </Pressable>

      <View className="flex-row items-center justify-between gap-2 py-1">
        <Pressable
          onPress={() => setDate((d) => dayjs(d).subtract(1, 'day').format('YYYY-MM-DD'))}
          accessibilityLabel="Ngày trước"
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-left" size={20} tone="default" />
        </Pressable>
        <Text variant="subtitle" className="capitalize">{dayjs(date).format('dddd, DD/MM/YYYY')}</Text>
        <Pressable
          onPress={() => setDate((d) => dayjs(d).add(1, 'day').format('YYYY-MM-DD'))}
          accessibilityLabel="Ngày sau"
          className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
        >
          <Icon name="chevron-right" size={20} tone="default" />
        </Pressable>
      </View>

      {shifts.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được ca: {extractApiError(shifts.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => shifts.refetch()}>Thử lại</Button>
        </View>
      ) : !shifts.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted">Không có ca nào {canSpot || canConduct ? 'trong ngày này' : 'của bạn trong ngày này'}.</Text>
        </View>
      ) : (
        list.map((shift) => (
          <ShiftCard
            key={`${shift.shiftScheduleId}-${shift.date}`}
            shift={shift}
            canConduct={canConduct}
            canSpot={canSpot}
            starting={starting}
            onStart={onStart}
          />
        ))
      )}
    </Screen>
  );
}
