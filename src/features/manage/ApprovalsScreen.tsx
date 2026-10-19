import { useState } from 'react';
import { Image, View } from 'react-native';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Skeleton, SegmentedControl } from 'src/components/ui';
import { toast, confirm, showActionSheet } from 'src/components/overlay';
import { getStorageUrl } from 'src/api/axios';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { NEED_TYPE_LABEL, fmtMoney } from 'src/features/schedule/constants';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import type { AttendanceRequestType, IAttendanceRequest,IShiftPoolPost, ILateCoverRequest, IShiftSwapRequest, IFaceEnrollmentRequest } from 'src/types/corecms-api';

import {
  usePendingAttendanceRequests,
  usePendingSwapRequests,
  usePendingShiftPoolPosts,
  useProcessAttendanceRequest,
  useReviewSwapRequest,
  useReviewShiftPoolPost,
  usePendingFaceEnrollments,
  useReviewFaceEnrollment,
} from './hooks';

// ----------------------------------------------------------------------
// Trung tâm duyệt yêu cầu (Manager/Admin): Chấm công / Đổi ca / Chợ ca.
// Tab "Chợ ca" là ShiftPool (Swap/FullCover/PartialCover) — tính năng đổi ca
// & làm hộ THẬT SỰ đang dùng trên web, thay cho LateCoverRequest cũ (đã ngừng
// tạo request mới nên trước đây tab này luôn hiện rỗng dù có noti chờ duyệt).
// Quy tắc ca đã bắt đầu do BE (ShiftMutationGuard) chặn — FE chỉ hiển thị
// lỗi trả về, không tự nhân bản luật.
// ----------------------------------------------------------------------

type Tab = 'attendance' | 'swap' | 'pool' | 'face';

/** Ngưỡng nhận diện của máy chủ (KioskSettings.SimilarityThreshold). */
const FACE_MATCH_THRESHOLD = 0.55;

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
  const { user } = useAuthContext();
  // Huỷ sớm yêu cầu đang chờ người được nhờ xác nhận: shift.override (mặc định chỉ Admin, như API).
  const isAdmin = hasPermission(user, PERMISSIONS.shift.override);
  const mutation = useReviewSwapRequest();
  const decide = useDecide();

  // Request mới tạo nằm ở WaitingTargetConfirmation cho tới khi NV được nhờ xác
  // nhận — BE chưa cho Approve/Reject ở trạng thái này, chỉ Admin huỷ được sớm.
  const waitingTarget = item.status === 'WaitingTargetConfirmation';

  const cancelRequest = async () => {
    const ok = await confirm({
      title: 'Huỷ yêu cầu đổi ca',
      message: `Huỷ yêu cầu đổi ca của ${item.requesterName}?`,
      confirmText: 'Huỷ yêu cầu',
      destructive: true,
    });
    if (!ok) return;
    try {
      await mutation.mutateAsync({ id: item.id, status: 'Cancelled' });
      haptics.success();
      toast.success('Đã huỷ yêu cầu.');
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Không huỷ được');
    }
  };

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
      {waitingTarget ? (
        isAdmin ? (
          <Button variant="soft" action="error" size="sm" loading={mutation.isPending} onPress={cancelRequest}>
            Huỷ yêu cầu
          </Button>
        ) : (
          <Text variant="caption" tone="muted">Đang chờ nhân viên được nhờ xác nhận.</Text>
        )
      ) : (
        <ReviewActions
          busy={mutation.isPending}
          onDecide={(status) =>
            decide(`yêu cầu đổi ca của ${item.requesterName}`, status, () =>
              mutation.mutateAsync({ id: item.id, status })
            )
          }
        />
      )}
    </Card>
  );
}

function PoolCard({ item }: { item: IShiftPoolPost }) {
  const mutation = useReviewShiftPoolPost();
  const decide = useDecide();
  return (
    <Card className="p-4 gap-2">
      <View className="flex-row items-center gap-2">
        <Icon name="account-switch" size={18} tone="primary" />
        <Text variant="subtitle" className="flex-1">{item.posterName} → {item.claimerName ?? '—'}</Text>
        <Badge tone="info">{NEED_TYPE_LABEL[item.needType]}</Badge>
      </View>
      <Text variant="bodySmall" tone="muted">
        Ca: {item.shiftName} · {dayjs(item.shiftDate).format('DD/MM')} · {item.shiftStartTime}–{item.shiftEndTime}
      </Text>
      {item.needType === 'PartialCover' && item.partialStartTime ? (
        <Text variant="bodySmall" tone="muted">
          Khoảng làm hộ: {item.partialStartTime.slice(0, 5)}–{item.partialEndTime?.slice(0, 5)}
        </Text>
      ) : null}
      {item.needType === 'Swap' && item.claimerOfferedShiftName ? (
        <Text variant="bodySmall" tone="muted">
          Đổi lại: {item.claimerOfferedShiftName}
          {item.claimerOfferedShiftDate ? ` · ${dayjs(item.claimerOfferedShiftDate).format('DD/MM')}` : ''}
        </Text>
      ) : null}
      {item.extraPayAmount ? (
        <Text variant="bodySmall" tone="muted">Phụ trội: {fmtMoney(item.extraPayAmount)}</Text>
      ) : null}
      {item.note ? <Text variant="bodySmall">Ghi chú: {item.note}</Text> : null}
      <Text variant="caption" tone="faint">Gửi lúc {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}</Text>
      <ReviewActions
        busy={mutation.isPending}
        onDecide={(status) =>
          decide(`yêu cầu ${NEED_TYPE_LABEL[item.needType].toLowerCase()} của ${item.posterName}`, status, () =>
            mutation.mutateAsync({ id: item.id, status })
          )
        }
      />
    </Card>
  );
}

function FacePhoto({ url, caption }: { url: string | null; caption: string }) {
  return (
    <View className="flex-1 gap-1">
      <View className="rounded-xl overflow-hidden bg-bg dark:bg-bg-dark items-center justify-center" style={{ aspectRatio: 3 / 4 }}>
        {url ? (
          <Image source={{ uri: getStorageUrl(url) }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
        ) : (
          <Text variant="caption" tone="faint" className="text-center px-2">Chưa có khuôn mặt</Text>
        )}
      </View>
      <Text variant="caption" tone="muted" className="text-center">{caption}</Text>
    </View>
  );
}

/** Đăng ký khuôn mặt chờ duyệt: ảnh đang dùng cạnh ảnh mới + % giống (lần đầu thì chưa có ảnh để so). */
function FaceCard({ item }: { item: IFaceEnrollmentRequest }) {
  const mutation = useReviewFaceEnrollment();
  const first = item.similarityToCurrent == null;
  const pct = first ? null : Math.round((item.similarityToCurrent ?? 0) * 100);

  const done = (approved: boolean) => {
    haptics.success();
    toast.success(approved ? `Đã duyệt khuôn mặt của ${item.staffName}.` : `Đã từ chối — ${item.staffName} sẽ được báo đăng ký lại.`);
  };
  const fail = (err: unknown) => {
    haptics.error();
    toast.error(extractApiError(err), 'Không xử lý được');
  };

  const approve = async () => {
    const ok = await confirm({
      title: 'Duyệt khuôn mặt',
      message: `Dùng khuôn mặt mới cho ${item.staffName}? Khuôn mặt đang dùng sẽ bị thay.`,
      confirmText: 'Duyệt',
    });
    if (!ok) return;
    try {
      await mutation.mutateAsync({ id: item.id, status: 'Approved' });
      done(true);
    } catch (err) {
      fail(err);
    }
  };

  const reject = () => {
    const run = async (reason?: string) => {
      try {
        await mutation.mutateAsync({ id: item.id, status: 'Rejected', reviewNote: reason });
        done(false);
      } catch (err) {
        fail(err);
      }
    };
    void showActionSheet({
      title: `Từ chối khuôn mặt của ${item.staffName}`,
      message: 'Khuôn mặt mới bị bỏ, khuôn mặt đang dùng giữ nguyên.',
      options: [
        { label: 'Không phải nhân viên này', icon: 'account-cancel', destructive: true, onPress: () => void run('Không phải bạn') },
        { label: 'Ảnh mờ / thiếu sáng', icon: 'image-off-outline', destructive: true, onPress: () => void run('Ảnh mờ hoặc thiếu sáng') },
        { label: 'Từ chối, không ghi lý do', icon: 'close-circle-outline', destructive: true, onPress: () => void run() },
      ],
    });
  };

  return (
    <Card className="p-4 gap-3">
      <View className="flex-row items-center gap-2">
        <Icon name="face-recognition" size={18} tone="primary" />
        <View className="flex-1">
          <Text variant="subtitle" numberOfLines={1}>{item.staffName}</Text>
          <Text variant="caption" tone="faint">Gửi lúc {dayjs(item.createdAt).format('HH:mm DD/MM/YYYY')}</Text>
        </View>
        {first ? <Badge tone="info">Lần đầu</Badge> : <Badge tone={pct! >= 40 ? 'warning' : 'error'}>{`Giống ${pct}%`}</Badge>}
      </View>
      <View className="flex-row gap-3">
        <FacePhoto url={item.currentPhotoUrl} caption="Đang dùng" />
        <FacePhoto url={item.newPhotoUrl} caption="Mới đăng ký" />
      </View>
      <Text variant="caption" tone="muted">
        {first
          ? 'Chưa có khuôn mặt để so — kiểm tra đúng là nhân viên này.'
          : `Khác khuôn mặt đang dùng (nhận ra cùng người từ ${Math.round(FACE_MATCH_THRESHOLD * 100)}%). Duyệt nếu đúng là nhân viên này.`}
      </Text>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button variant="soft" action="error" size="sm" disabled={mutation.isPending} onPress={reject}>
            Từ chối
          </Button>
        </View>
        <View className="flex-1">
          <Button size="sm" loading={mutation.isPending} onPress={approve}>
            Duyệt
          </Button>
        </View>
      </View>
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
  const { user } = useAuthContext();
  // Mỗi tab theo quyền của API nó gọi — vai trò tuỳ chỉnh chỉ có một quyền thì chỉ thấy tab đó, không gọi API 403.
  const canAttendance = hasPermission(user, PERMISSIONS.attendance.requestProcess);
  const canShift = hasPermission(user, PERMISSIONS.shift.requestReview);
  const canFace = hasPermission(user, PERMISSIONS.user.update);
  const tabs: Tab[] = [
    ...(canAttendance ? (['attendance'] as const) : []),
    ...(canShift ? (['swap', 'pool'] as const) : []),
    ...(canFace ? (['face'] as const) : []),
  ];
  const [pickedTab, setTab] = useState<Tab>(tabs[0] ?? 'attendance');
  const tab = tabs.includes(pickedTab) ? pickedTab : tabs[0] ?? 'attendance';

  const att = usePendingAttendanceRequests(canAttendance);
  const swap = usePendingSwapRequests(canShift);
  const pool = usePendingShiftPoolPosts(canShift);
  const face = usePendingFaceEnrollments(canFace);

  const current = { attendance: att, swap, pool, face }[tab];
  const refreshing = att.isFetching || swap.isFetching || pool.isFetching || face.isFetching;
  const onRefresh = () => {
    if (canAttendance) att.refetch();
    if (canShift) {
      swap.refetch();
      pool.refetch();
    }
    if (canFace) face.refetch();
  };

  const label = (base: string, n?: number) => (n ? `${base} (${n})` : base);

  return (
    <Screen scroll tabBarInset={false} refreshing={refreshing} onRefresh={onRefresh}>
      <AppHeader title="Duyệt yêu cầu" subtitle="Yêu cầu đang chờ xử lý" back />

      <SegmentedControl
        segments={[
          { key: 'attendance', label: label('Chấm công', att.data?.length) },
          { key: 'swap', label: label('Đổi ca', swap.data?.length) },
          { key: 'pool', label: label('Chợ ca', pool.data?.length) },
          { key: 'face', label: label('Khuôn mặt', face.data?.length) },
        ].filter((s) => tabs.includes(s.key as Tab))}
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
      ) : tab === 'face' ? (
        (face.data ?? []).map((r) => <FaceCard key={r.id} item={r} />)
      ) : (
        (pool.data ?? []).map((r) => <PoolCard key={r.id} item={r} />)
      )}
    </Screen>
  );
}
