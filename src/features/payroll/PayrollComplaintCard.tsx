import { useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard, Sheet } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import {
  filePayrollComplaint,
  getMyPayrollComplaints,
  getPayrollComplaintWindow,
  withdrawPayrollComplaint,
} from 'src/api/hr';
import { PAYROLL_COMPLAINT_STATUS_LABEL, type IPayrollComplaint, type PayrollComplaintStatus } from 'src/types/hr';

// ----------------------------------------------------------------------
// Khiếu nại phiếu lương (Quy chế Điều 12.3): trong 3 ngày làm việc kể từ ngày nhận phiếu (không tính Chủ nhật); quản lý trả
// lời trong 3 ngày làm việc. Có sai sót thì bảng lương được tính lại — khiếu nại không tự đổi tiền.
// ----------------------------------------------------------------------

const STATUS_TONE: Record<PayrollComplaintStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  Pending: 'warning',
  Accepted: 'info',
  Rejected: 'success',
  Withdrawn: 'neutral',
};

function ComplaintRow({ c, onWithdraw, busy }: { c: IPayrollComplaint; onWithdraw: () => void; busy: boolean }) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="caption" tone="muted">Gửi {dayjs(c.createdAt).format('HH:mm DD/MM')}</Text>
        <Badge tone={c.isOverdue ? 'error' : STATUS_TONE[c.status]}>
          {c.isOverdue ? 'Quá hạn trả lời' : PAYROLL_COMPLAINT_STATUS_LABEL[c.status]}
        </Badge>
      </View>
      <Text variant="bodySmall">{c.content}</Text>
      {c.reply ? (
        <Text variant="bodySmall" tone="primary">Trả lời: {c.reply}</Text>
      ) : c.status === 'Pending' ? (
        <View className="flex-row items-center justify-between">
          <Text variant="caption" tone="muted">Hạn trả lời {dayjs(c.replyDueOn).format('DD/MM')}</Text>
          <Button size="sm" variant="outline" fullWidth={false} loading={busy} disabled={busy} onPress={onWithdraw}>
            Rút
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** Thẻ khiếu nại trên màn Chi tiết lương: nút gửi (khi còn hạn) + các khiếu nại của phiếu này. */
export function PayrollComplaintCard({ payrollRecordId }: { payrollRecordId: string }) {
  const qc = useQueryClient();
  // Backend cũ chưa có /payroll-complaints, hoặc phiếu chưa gửi cho nhân viên → ẩn thẻ.
  const windowQuery = useQuery({
    queryKey: ['payroll', 'complaint-window', payrollRecordId],
    queryFn: () => getPayrollComplaintWindow(payrollRecordId).catch(() => null),
  });
  const mineQuery = useQuery({
    queryKey: ['payroll', 'complaints', 'mine'],
    queryFn: () => getMyPayrollComplaints().catch(() => []),
  });
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const win = windowQuery.data;
  const mine = (mineQuery.data ?? []).filter((c) => c.payrollRecordId === payrollRecordId);
  if (!win && mine.length === 0) return null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payroll', 'complaint-window', payrollRecordId] });
    qc.invalidateQueries({ queryKey: ['payroll', 'complaints', 'mine'] });
  };

  async function submit() {
    setBusy('file');
    try {
      await filePayrollComplaint(payrollRecordId, text.trim());
      toast.success('Đã gửi khiếu nại — quản lý trả lời trong 3 ngày làm việc.');
      setOpen(false);
      setText('');
      refresh();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa gửi được');
    } finally {
      setBusy(null);
    }
  }

  async function withdraw(id: string) {
    setBusy(id);
    try {
      await withdrawPayrollComplaint(id);
      toast.success('Đã rút khiếu nại.');
      refresh();
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa rút được');
    } finally {
      setBusy(null);
    }
  }

  const canFile = !!win?.isOpen && !win.pendingComplaintId;

  return (
    <SectionCard title="Khiếu nại phiếu lương" icon="message-alert-outline" bodyClassName="pt-0 gap-2">
      {win ? (
        <Text variant="caption" tone="muted">
          {win.isOpen
            ? `Thấy sai sót? Gửi khiếu nại đến hết ngày ${dayjs(win.deadline).format('DD/MM')} (3 ngày làm việc kể từ ngày nhận phiếu).`
            : `Đã hết hạn khiếu nại (${dayjs(win.deadline).format('DD/MM')}) — trao đổi trực tiếp với quản lý.`}
        </Text>
      ) : null}
      {mine.map((c) => (
        <ComplaintRow key={c.id} c={c} busy={busy === c.id} onWithdraw={() => withdraw(c.id)} />
      ))}
      {canFile ? (
        <Button size="sm" variant="outline" icon="message-alert-outline" onPress={() => setOpen(true)}>
          Khiếu nại phiếu lương
        </Button>
      ) : null}

      <Sheet
        visible={open}
        title="Khiếu nại phiếu lương"
        onClose={busy ? () => {} : () => setOpen(false)}
        footer={
          <Button loading={busy === 'file'} disabled={!!busy || !text.trim()} onPress={submit}>
            Gửi khiếu nại
          </Button>
        }
      >
        <Text variant="caption" tone="muted">
          Ghi rõ khoản nào sai: ca nào, ngày nào, số giờ / số tiền đúng theo bạn.
        </Text>
        <TextField label="Nội dung khiếu nại" value={text} onChangeText={setText} multiline maxLength={2000} />
      </Sheet>
    </SectionCard>
  );
}
