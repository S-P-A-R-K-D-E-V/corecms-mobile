import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Text, Button, TextField, SegmentedControl } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { fmtMoney } from 'src/features/admin-dashboard/hooks';
import type { IPayrollComplaint, PayrollComplaintOutcome } from 'src/types/hr';

import { useReplyPayrollComplaint } from './hooks';

// ----------------------------------------------------------------------
// Trả lời khiếu nại phiếu lương (payroll.complaint.review) — khớp core-fe ReplyDialog: "Phiếu đúng" hoặc "Có sai sót" +
// câu trả lời bắt buộc. Trả lời không tự đổi tiền: có sai sót thì sửa phiếu (chỉnh công, bỏ qua lỗi, tính lại) trước.
// ----------------------------------------------------------------------

const OUTCOMES = [
  { key: 'Rejected', label: 'Phiếu đúng' },
  { key: 'Accepted', label: 'Có sai sót' },
];

export function ReplyComplaintSheet({ complaint, onClose }: { complaint: IPayrollComplaint | null; onClose: () => void }) {
  const replyM = useReplyPayrollComplaint();
  const [outcome, setOutcome] = useState<PayrollComplaintOutcome>('Rejected');
  const [reply, setReply] = useState('');

  useEffect(() => {
    setOutcome('Rejected');
    setReply('');
  }, [complaint?.id]);

  async function submit() {
    if (!complaint) return;
    try {
      await replyM.mutateAsync({ id: complaint.id, outcome, reply: reply.trim() });
      haptics.success();
      toast.success(
        outcome === 'Accepted' ? 'Đã trả lời. Nhớ tính lại lương của người này nếu chưa tính.' : 'Đã trả lời khiếu nại.',
        'Đã gửi'
      );
      onClose();
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Chưa trả lời được');
    }
  }

  return (
    <Sheet
      visible={!!complaint}
      title="Trả lời khiếu nại phiếu lương"
      onClose={replyM.isPending ? () => {} : onClose}
      footer={
        <Button loading={replyM.isPending} disabled={replyM.isPending || !reply.trim()} onPress={submit}>
          Gửi trả lời
        </Button>
      }
    >
      {complaint ? (
        <>
          <Text variant="caption" tone={complaint.isOverdue ? 'error' : 'muted'}>
            {complaint.staffName} · kỳ {dayjs(complaint.fromDate).format('DD/MM')}–{dayjs(complaint.toDate).format('DD/MM/YYYY')} ·
            lương lúc gửi {fmtMoney(complaint.totalSalaryAtFiling)}. Hạn trả lời {dayjs(complaint.replyDueOn).format('DD/MM')}
            {complaint.isOverdue ? ' — đã quá hạn.' : '.'}
          </Text>
          <Text variant="bodySmall">{complaint.content}</Text>
          <SegmentedControl segments={OUTCOMES} value={outcome} onChange={(k) => setOutcome(k as PayrollComplaintOutcome)} />
          <Text variant="caption" tone="muted">
            {outcome === 'Accepted'
              ? 'Có sai sót: sửa phiếu (chỉnh giờ công, bỏ qua lỗi, tính lại lương) rồi trả lời để nhân viên biết.'
              : 'Phiếu đúng: giải thích cho nhân viên vì sao phiếu không sai.'}
          </Text>
          <TextField label="Trả lời cho nhân viên" value={reply} onChangeText={setReply} multiline maxLength={2000} />
        </>
      ) : null}
    </Sheet>
  );
}
