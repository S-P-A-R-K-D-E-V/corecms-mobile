import { useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Skeleton, SegmentedControl } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import type { AttendanceRequestType, IAttendanceRequest, ILateCoverRequest, IShiftSwapRequest } from 'src/types/corecms-api';

import {
  usePendingAttendanceRequests,
  usePendingSwapRequests,
  usePendingLateCoverRequests,
  useProcessAttendanceRequest,
  useReviewSwapRequest,
  useReviewLateCoverRequest,
} from './hooks';

// ----------------------------------------------------------------------
// Trung tâm duyệt yêu cầu (Manager/Admin): Chấm công / Đổi ca / Làm hộ.
// Quy tắc ca đã bắt đầu do BE (ShiftMutationGuard) chặn — FE chỉ hiển thị
// lỗi trả về, không tự nhân bản luật.
// ----------------------------------------------------------------------

type Tab = 'attendance' | 'swap' | 'cover';

const REQUEST_TYPE_LABEL: Record<AttendanceRequestType, string> = {
  MissedCheckIn: 'Quên giờ vào',
  MissedCheckOut: 'Quên giờ ra',
  OvertimeCompensation: 'Bù thêm giờ',
  ShiftSwap: 'Đổi ca',
};

function ReviewActions({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (status: 'Approved' | 'Rejected') => void;
}) {
  return (
    <View className="flex-row gap-2 pt-1">
      <View className="flex-1">
        <Button variant="soft" action="error" size="sm" disabled={busy} onPress={() => onDecide('Rejected')}>
          Từ chối
        </Button>
      </View>
      <View className="flex-1">
        <Button size="sm" loading={busy} onPress={() => onDecide('Approved')}>
          Duyệt
        </Button>
      </View>
    </View>
  );
}

/** Hỏi xác nhận rồi chạy mutation duyệt/từ chối — dùng chung cho 3 loại. */
function useDecide() {
  return async function decide(
    label: string,
    status: 'Approved' | 'Rejected',
    run: () => Promise<unknown>
  ) {
    const approving = status === 'Approved';
    const ok = await confirm({
      title: approving ? 'Duyệt yêu cầu' : 'Từ chối yêu cầu',
      message: `${approving ? 'Duyệt' : 'Từ chối'} ${label}?`,
      confirmText: approving ? 'Duyệt' : 'Từ chối',
      destructive: !approving,
    });
    if (!ok) return;
    try {
      await run();
      haptics.success();
      toast.success(approving ? 'Đã duyệt yêu cầu.' : 'Đã từ chối yêu cầu.');
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Không xử lý được');
    }
  };
}

// ── Cards cho từng loại yêu cầu ────────────────────────────────────────

function AttendanceCard({ item }: { item: IAttendanceRequest }) {
  const mutation = useProcessAttendanceRequest();
  const decide = useDecide();
  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name="account-clock" size={18} tone="primary" />
        <Text variant="subtitle" className="flex-1">{item.staffName}</Text>
        <Badge tone="info">{REQUEST_TYPE_LABEL[item.requestType] ?? item.requestType}</Badge>
      </View>
      {item.requestedCheckInTime ? (
        <Text variant="bodySmall" tone="muted">Giờ vào đề nghị: {dayjs(item.requestedCheckInTime).format('HH:mm DD/MM')}</Text>
      ) : null}
      {item.requestedCheckOutTime ? (
        <Text variant="bodySmall" tone="muted">Giờ ra đề nghị: {dayjs(item.requestedCheckOutTime).format('HH:mm DD/MM')}</Text>
      ) : null}
      <Text variant="bodySmall">Lý do: {item.reason}</Text>
      <Text variant="caption" tone="faint">Gửi lúc {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}</Text>
      <ReviewActions
        busy={mutation.isPending}
        onDecide={(status) =>
          decide(
            `yêu cầu "${REQUEST_TYPE_LABEL[item.requestType] ?? item.requestType}" của ${item.staffName}`,
            status,
            () => mutation.mutateAsync({ id: item.id, status })
          )
        }
      />
    </Card>
  );
}

function SwapCard({ item }: { item: IShiftSwapRequest }) {
  const mutation = useReviewSwapRequest();
  const decide = useDecide();
  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name="swap-horizontal" size={18} tone="primary" />
        <Text variant="subtitle" className="flex-1">{item.requesterName}</Text>
        {item.targetConfirmedAt ? <Badge tone="success">NV đã xác nhận</Badge> : <Badge tone="warning">Chờ NV xác nhận</Badge>}
      </View>
      <Text variant="bodySmall" tone="muted">
        Ca hiện tại: {item.currentShiftName} · {dayjs(item.currentShiftDate).format('DD/MM')}
      </Text>
      {item.targetUserName ? (
        <Text variant="bodySmall" tone="muted">
          Đổi với: {item.targetUserName}
          {item.targetShiftName ? ` · ${item.targetShiftName} · ${dayjs(item.targetShiftDate).format('DD/MM')}` : ''}
        </Text>
      ) : null}
      {item.reason ? <Text variant="bodySmall">Lý do: {item.reason}</Text> : null}
      <Text variant="caption" tone="faint">Gửi lúc {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}</Text>
      <ReviewActions
        busy={mutation.isPending}
        onDecide={(status) =>
          decide(`yêu cầu đổi ca của ${item.requesterName}`, status, () =>
            mutation.mutateAsync({ id: item.id, status })
          )
        }
      />
    </Card>
  );
}

function CoverCard({ item }: { item: ILateCoverRequest }) {
  const mutation = useReviewLateCoverRequest();
  const decide = useDecide();
  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name="account-switch" size={18} tone="primary" />
        <Text variant="subtitle" className="flex-1">{item.lateStaffName} → {item.coveringStaffName}</Text>
        <Badge tone="info">{item.coveringHours}h</Badge>
      </View>
      <Text variant="bodySmall" tone="muted">
        Ca: {item.lateShiftName} · {dayjs(item.lateShiftDate).format('DD/MM')} · {item.coveringStartTime}–{item.coveringEndTime}
      </Text>
      <Text variant="bodySmall" tone="muted">
        Phụ trội: {item.extraPayAmount.toLocaleString('vi-VN')}đ
      </Text>
      {item.reason ? <Text variant="bodySmall">Lý do: {item.reason}</Text> : null}
      <Text variant="caption" tone="faint">Gửi lúc {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}</Text>
      <ReviewActions
        busy={mutation.isPending}
        onDecide={(status) =>
          decide(`yêu cầu làm hộ ${item.lateStaffName} → ${item.coveringStaffName}`, status, () =>
            mutation.mutateAsync({ id: item.id, status })
          )
        }
      />
    </Card>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <View className="gap-3">
      {[0, 1].map((i) => (
        <Card key={i} className="p-4 gap-3">
          <Skeleton width={170} height={16} />
          <Skeleton width="80%" height={12} />
          <Skeleton width="100%" height={34} radius={10} />
        </Card>
      ))}
    </View>
  );
}

export function ApprovalsScreen() {
  const [tab, setTab] = useState<Tab>('attendance');

  const att = usePendingAttendanceRequests();
  const swap = usePendingSwapRequests();
  const cover = usePendingLateCoverRequests();

  const current = { attendance: att, swap, cover }[tab];
  const refreshing = att.isFetching || swap.isFetching || cover.isFetching;
  const onRefresh = () => {
    att.refetch();
    swap.refetch();
    cover.refetch();
  };

  const label = (base: string, n?: number) => (n ? `${base} (${n})` : base);

  return (
    <Screen scroll tabBarInset={false} refreshing={refreshing} onRefresh={onRefresh}>
      <AppHeader title="Duyệt yêu cầu" subtitle="Yêu cầu đang chờ xử lý" back />

      <SegmentedControl
        segments={[
          { key: 'attendance', label: label('Chấm công', att.data?.length) },
          { key: 'swap', label: label('Đổi ca', swap.data?.length) },
          { key: 'cover', label: label('Làm hộ', cover.data?.length) },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />

      {current.isLoading ? (
        <ListSkeleton />
      ) : current.isError ? (
        <ErrorView onRetry={current.refetch} />
      ) : !current.data || current.data.length === 0 ? (
        <EmptyState icon="check-circle-outline" title="Không có yêu cầu chờ" description="Tất cả yêu cầu đã được xử lý." />
      ) : tab === 'attendance' ? (
        (att.data ?? []).map((r) => <AttendanceCard key={r.id} item={r} />)
      ) : tab === 'swap' ? (
        (swap.data ?? []).map((r) => <SwapCard key={r.id} item={r} />)
      ) : (
        (cover.data ?? []).map((r) => <CoverCard key={r.id} item={r} />)
      )}
    </Screen>
  );
}
