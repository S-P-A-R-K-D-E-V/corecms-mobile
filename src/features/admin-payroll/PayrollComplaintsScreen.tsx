import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, EmptyState, ErrorView, SectionCard } from 'src/components/shared';
import { Card, Text, Badge, Button, Skeleton, SegmentedControl } from 'src/components/ui';
import { fmtMoney } from 'src/features/admin-dashboard/hooks';
import { useActiveHrRules } from 'src/features/hr/hooks';
import { PAYROLL_COMPLAINT_STATUS_LABEL, type IPayrollComplaint, type PayrollComplaintStatus } from 'src/types/hr';

import { usePayrollComplaints, usePayrollCycles } from './hooks';
import { usePayrollAccess } from './access';
import { cycleIdForComplaint, sortComplaintsForReview } from './complaints';
import { ReplyComplaintSheet } from './ReplyComplaintSheet';

// ----------------------------------------------------------------------
// Khiếu nại phiếu lương — hộp thư của quản lý (payroll.complaint.review), như core-fe /dashboard/payroll/complaints.
// Mỗi khiếu nại mở thẳng phiếu lương của người gửi để sửa (chỉnh giờ công, bỏ qua lỗi, tính lại) rồi trả lời.
// ----------------------------------------------------------------------

const STATUS_TONE: Record<PayrollComplaintStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  Pending: 'warning',
  Accepted: 'info',
  Rejected: 'success',
  Withdrawn: 'neutral',
};

const SCOPES = [
  { key: 'pending', label: 'Chờ trả lời' },
  { key: 'all', label: 'Tất cả' },
];

/** Một khiếu nại: người gửi, kỳ, nội dung, trạng thái / trả lời; nút mở phiếu và trả lời (khi còn chờ). */
export function ComplaintItem({
  c,
  onOpenRecord,
  onReply,
}: {
  c: IPayrollComplaint;
  /** Không truyền = đang ở chính phiếu lương đó. */
  onOpenRecord?: () => void;
  onReply?: () => void;
}) {
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="subtitle" className="flex-1 text-[15px]" numberOfLines={1}>{c.staffName}</Text>
        <Badge tone={c.isOverdue ? 'error' : STATUS_TONE[c.status]}>
          {c.isOverdue ? 'Quá hạn trả lời' : PAYROLL_COMPLAINT_STATUS_LABEL[c.status]}
        </Badge>
      </View>
      <Text variant="caption" tone="muted">
        Kỳ {dayjs(c.fromDate).format('DD/MM')}–{dayjs(c.toDate).format('DD/MM/YYYY')} · lương lúc gửi {fmtMoney(c.totalSalaryAtFiling)} ·
        gửi {dayjs(c.createdAt).format('HH:mm DD/MM')}
      </Text>
      <Text variant="bodySmall">{c.content}</Text>
      {c.reply ? (
        <Text variant="bodySmall" tone="primary">Trả lời: {c.reply}</Text>
      ) : c.status === 'Pending' ? (
        <Text variant="caption" tone={c.isOverdue ? 'error' : 'muted'}>Hạn trả lời {dayjs(c.replyDueOn).format('DD/MM')}</Text>
      ) : null}
      {onOpenRecord || (onReply && c.status === 'Pending') ? (
        <View className="flex-row gap-2 pt-1">
          {onOpenRecord ? (
            <View className="flex-1">
              <Button size="sm" variant="soft" action="neutral" icon="file-document-edit-outline" onPress={onOpenRecord}>
                Mở phiếu để sửa
              </Button>
            </View>
          ) : null}
          {onReply && c.status === 'Pending' ? (
            <View className="flex-1">
              <Button size="sm" icon="reply-outline" onPress={onReply}>Trả lời</Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function PayrollComplaintsScreen() {
  const [scope, setScope] = useState<'pending' | 'all'>('pending');
  const [replying, setReplying] = useState<IPayrollComplaint | null>(null);
  const { canReviewComplaints } = usePayrollAccess();
  const days = useActiveHrRules()?.complaintWorkingDays ?? null;
  const { data, isLoading, isError, refetch, isFetching } = usePayrollComplaints(scope, canReviewComplaints);
  const cyclesQ = usePayrollCycles();
  const list = useMemo(() => sortComplaintsForReview(data ?? []), [data]);

  function openRecord(c: IPayrollComplaint) {
    router.push({
      pathname: '/admin/payroll-record' as any,
      params: { recordId: c.payrollRecordId, userName: c.staffName, cycleId: cycleIdForComplaint(cyclesQ.data, c) ?? '' },
    });
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Khiếu nại phiếu lương" subtitle="Nhân viên báo phiếu lương sai" back />

      <Text variant="caption" tone="muted">
        {days
          ? `Nhân viên khiếu nại trong ${days} ngày làm việc kể từ ngày nhận phiếu; cửa hàng trả lời trong ${days} ngày làm việc (không tính Chủ nhật). `
          : 'Cửa hàng chưa bật khiếu nại phiếu lương (cấu hình luật nhân sự trên web). '}
        Có sai sót thì mở phiếu, sửa rồi trả lời.
      </Text>

      <SegmentedControl segments={SCOPES} value={scope} onChange={(k) => setScope(k as 'pending' | 'all')} />

      {isLoading ? (
        <View className="gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} width="100%" height={120} radius={16} />)}
        </View>
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="message-check-outline"
          title={scope === 'pending' ? 'Không có khiếu nại đang chờ' : 'Chưa có khiếu nại nào'}
          description="Khi nhân viên khiếu nại phiếu lương, bạn sẽ nhận thông báo và thấy ở đây."
        />
      ) : (
        list.map((c) => (
          <Card key={c.id} className="p-4">
            <ComplaintItem c={c} onOpenRecord={() => openRecord(c)} onReply={() => setReplying(c)} />
          </Card>
        ))
      )}

      <ReplyComplaintSheet complaint={replying} onClose={() => setReplying(null)} />
    </Screen>
  );
}

/** Thẻ trên màn chi tiết lương của một người: khiếu nại của chính phiếu này (ẩn khi không có / không có quyền). */
export function RecordComplaintsCard({ recordId }: { recordId: string }) {
  const { canReviewComplaints } = usePayrollAccess();
  const { data } = usePayrollComplaints('all', canReviewComplaints);
  const [replying, setReplying] = useState<IPayrollComplaint | null>(null);
  const mine = useMemo(
    () => sortComplaintsForReview((data ?? []).filter((c) => c.payrollRecordId === recordId)),
    [data, recordId]
  );
  if (mine.length === 0) return null;

  return (
    <SectionCard title="Khiếu nại của nhân viên" icon="message-alert-outline" bodyClassName="pt-0 gap-3">
      {mine.map((c) => (
        <ComplaintItem key={c.id} c={c} onReply={() => setReplying(c)} />
      ))}
      <ReplyComplaintSheet complaint={replying} onClose={() => setReplying(null)} />
    </SectionCard>
  );
}
