import { useEffect, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Button, Text, TextField, Icon, Badge } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import type { IPayrollShiftItem, WaivableViolationType } from 'src/types/corecms-api';

import { useWaivePenalty } from './hooks';

// ----------------------------------------------------------------------
// Bỏ qua lỗi vi phạm 1 ca (Admin/Manager) — rule khớp core-fe: chỉ hiện cho ca
// Vắng (Absent) / Sai ca (WrongShift) / Có mặt-đi-muộn (Late). Lý do tuỳ chọn.
// Sau khi bỏ qua phải "Tính lại lương" để thực sự trừ khoản phạt.
// ----------------------------------------------------------------------

const VIOLATION_LABEL: Record<WaivableViolationType, string> = {
  Late: 'Đi muộn',
  EarlyLeave: 'Về sớm',
  WrongShift: 'Sai ca',
  Absent: 'Vắng',
};

/** Loại vi phạm có thể bỏ qua cho 1 ca — null nếu ca không có lỗi để bỏ qua. */
export function waivableViolation(s: IPayrollShiftItem): WaivableViolationType | null {
  if (s.isWaived) return null;
  if (s.status === 'Absent') return 'Absent';
  if (s.status === 'Wrong') return 'WrongShift';
  if (s.status === 'Present' && s.lateMinutes > 0) return 'Late';
  return null;
}

export function WaivePenaltySheet({
  shift,
  userId,
  visible,
  onClose,
  onDone,
}: {
  shift: IPayrollShiftItem | null;
  userId: string;
  visible: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const waiveM = useWaivePenalty();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (visible) setReason('');
  }, [visible, shift?.shiftAssignmentId]);

  if (!shift) return null;
  const violation = waivableViolation(shift);

  async function confirm() {
    if (!shift || !violation) return;
    try {
      await waiveM.mutateAsync({
        shiftAssignmentId: shift.shiftAssignmentId,
        userId,
        violationType: violation,
        reason: reason.trim() || undefined,
      });
      haptics.success();
      toast.success('Đã bỏ qua lỗi. Hãy "Tính lại lương" để áp dụng.', 'Hoàn tất');
      onClose();
      onDone?.();
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không bỏ qua được');
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Bỏ qua lỗi vi phạm"
      onClose={onClose}
      footer={
        <Button fullWidth loading={waiveM.isPending} disabled={!violation} onPress={confirm} icon="shield-check-outline">
          Xác nhận bỏ qua
        </Button>
      }
    >
      <View className="gap-3">
        <View className="flex-row items-center gap-3 p-3 rounded-2xl bg-primary-soft">
          <Icon name="shield-alert-outline" size={20} tone="primary" />
          <View className="flex-1">
            <Text variant="subtitle">{shift.shiftName}</Text>
            <Text variant="caption" tone="muted">
              {dayjs(shift.date).format('DD/MM/YYYY')} · {shift.shiftStartTime}–{shift.shiftEndTime}
            </Text>
          </View>
          {violation ? <Badge tone="warning">{VIOLATION_LABEL[violation]}</Badge> : null}
        </View>

        <TextField
          label="Lý do (tuỳ chọn)"
          value={reason}
          onChangeText={setReason}
          placeholder="Vd: có phép, sự cố hệ thống…"
          multiline
        />

        <Text variant="caption" tone="muted">
          Sau khi bỏ qua, khoản phạt của lỗi này sẽ không tính khi bạn "Tính lại lương".
        </Text>
      </View>
    </Sheet>
  );
}
