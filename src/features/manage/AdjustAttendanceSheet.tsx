import { useEffect, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Button, Text, TextField, TimeField, Icon } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';

import { useManualAdjustment } from './hooks';

// ----------------------------------------------------------------------
// Điều chỉnh chấm công của 1 nhân viên trên 1 ca (Manager/Admin). Nhập giờ
// vào/ra dạng HH:mm — ghép với ngày của ca thành ISO gửi manual-adjustment.
// Không thêm lib date-picker: dùng ô nhập HH:mm nhẹ, prefill từ log hiện có.
// Dùng chung: Lịch đội ngũ (từ IShiftAssignment) & Chi tiết bảng lương
// (từ IPayrollShiftItem) — chỉ cần AdjustTarget tối giản.
// ----------------------------------------------------------------------

/** Dữ liệu tối thiểu để điều chỉnh 1 ca. */
export type AdjustTarget = {
  shiftAssignmentId: string;
  staffId: string;
  staffName: string;
  shiftName: string;
  date: string;       // "yyyy-MM-dd"
  startTime: string;  // "HH:mm"
  endTime: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
};

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** ISO cục bộ (không Z) từ ngày ca + "HH:mm" — khớp hành vi core-fe.
 *  Parse "YYYY-MM-DD HH:mm" như các màn khác (không cần plugin customParseFormat). */
function toIso(date: string, hhmm: string): string {
  return dayjs(`${date} ${hhmm}`).format('YYYY-MM-DDTHH:mm:ss');
}

export function AdjustAttendanceSheet({
  target,
  visible,
  onClose,
}: {
  target: AdjustTarget | null;
  visible: boolean;
  onClose: () => void;
}) {
  const mutation = useManualAdjustment();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Prefill mỗi khi mở với 1 ca khác.
  useEffect(() => {
    if (!visible || !target) return;
    setCheckIn(target.checkInTime ? dayjs(target.checkInTime).format('HH:mm') : '');
    setCheckOut(target.checkOutTime ? dayjs(target.checkOutTime).format('HH:mm') : '');
    setNote('');
    setError('');
  }, [visible, target?.shiftAssignmentId]);

  if (!target) return null;

  async function submit() {
    if (!target) return;
    setError('');
    // Giờ vào & giờ ra đều KHÔNG bắt buộc — cho phép chỉnh riêng lẻ (giờ còn lại
    // giữ nguyên từ log hiện có). Chỉ chặn khi cả hai đều trống (không có gì để lưu).
    if (checkIn && !HHMM.test(checkIn)) return setError('Giờ vào phải dạng HH:mm (vd 08:30).');
    if (checkOut && !HHMM.test(checkOut)) return setError('Giờ ra phải dạng HH:mm (vd 17:00).');
    if (!checkIn && !checkOut) {
      toast.info('Chưa nhập giờ nào để điều chỉnh.', 'Không có thay đổi');
      return;
    }
    if (checkIn && checkOut && checkOut <= checkIn) return setError('Giờ ra phải sau giờ vào.');

    try {
      await mutation.mutateAsync({
        shiftAssignmentId: target.shiftAssignmentId,
        staffId: target.staffId,
        checkInTime: checkIn ? toIso(target.date, checkIn) : undefined,
        checkOutTime: checkOut ? toIso(target.date, checkOut) : undefined,
        note: note.trim() || undefined,
      });
      haptics.success();
      toast.success('Đã cập nhật chấm công.', 'Điều chỉnh thành công');
      onClose();
    } catch (err) {
      haptics.error();
      toast.error(extractApiError(err), 'Không cập nhật được');
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Điều chỉnh chấm công"
      onClose={onClose}
      footer={
        <Button fullWidth loading={mutation.isPending} onPress={submit} icon="content-save-outline">
          Lưu điều chỉnh
        </Button>
      }
    >
      <View className="gap-3">
        {/* Ngữ cảnh ca */}
        <View className="flex-row items-center gap-3 p-3 rounded-2xl bg-primary-soft">
          <Icon name="account-clock" size={20} tone="primary" />
          <View className="flex-1">
            <Text variant="subtitle">{target.staffName}</Text>
            <Text variant="caption" tone="muted">
              {target.shiftName} · {dayjs(target.date).format('DD/MM/YYYY')} · {target.startTime}–{target.endTime}
            </Text>
          </View>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1">
            <TimeField label="Giờ vào" value={checkIn} onChangeTime={setCheckIn} placeholder="08:30" />
          </View>
          <View className="flex-1">
            <TimeField label="Giờ ra" value={checkOut} onChangeTime={setCheckOut} placeholder="17:00" />
          </View>
        </View>

        <TextField
          label="Ghi chú (tùy chọn)"
          value={note}
          onChangeText={setNote}
          placeholder="Lý do điều chỉnh…"
          multiline
        />

        {error ? <Text variant="bodySmall" tone="error">{error}</Text> : null}
        <Text variant="caption" tone="muted">
          Để trống một ô nếu không đổi giá trị đó. Thao tác được ghi nhật ký kiểm toán.
        </Text>
      </View>
    </Sheet>
  );
}
