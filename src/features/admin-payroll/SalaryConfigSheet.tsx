import { useEffect, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Button, Text, TextField, SegmentedControl } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import type { ISalaryConfiguration, SalaryType } from 'src/types/corecms-api';

import { useUpsertSalaryConfig } from './hooks';

// ----------------------------------------------------------------------
// Đặt cấu hình lương cho 1 nhân viên (versioned-upsert). Loại lương: theo ca
// / theo giờ / theo tháng; số tiền; % thử việc (tuỳ chọn); hiệu lực từ ngày.
// ----------------------------------------------------------------------

const TYPES: { key: SalaryType; label: string; unit: string }[] = [
  { key: 'PerShift', label: 'Theo ca', unit: 'đ/ca' },
  { key: 'Hourly', label: 'Theo giờ', unit: 'đ/giờ' },
  { key: 'Monthly', label: 'Theo tháng', unit: 'đ/tháng' },
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function SalaryConfigSheet({
  userId,
  userName,
  current,
  visible,
  onClose,
  onSaved,
}: {
  userId: string;
  userName: string;
  current: ISalaryConfiguration | null;
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useUpsertSalaryConfig();
  const [type, setType] = useState<SalaryType>('PerShift');
  const [amount, setAmount] = useState('');
  const [probation, setProbation] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(dayjs().format('YYYY-MM-DD'));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setType((current?.salaryType as SalaryType) ?? 'PerShift');
    setAmount(current?.amount ? String(current.amount) : '');
    setProbation(current?.probationRate != null ? String(current.probationRate) : '');
    setEffectiveFrom(dayjs().format('YYYY-MM-DD'));
    setError('');
  }, [visible, current?.id]);

  const unit = TYPES.find((t) => t.key === type)?.unit ?? '';

  async function save() {
    setError('');
    const amt = Number(amount.replace(/[^\d.]/g, ''));
    if (!amt || amt <= 0) return setError('Nhập số tiền hợp lệ.');
    if (!DATE_RE.test(effectiveFrom)) return setError('Ngày hiệu lực phải dạng yyyy-MM-dd.');
    const rate = probation.trim() ? Number(probation) : undefined;
    if (rate != null && (isNaN(rate) || rate < 0 || rate > 100)) return setError('% thử việc phải trong 0–100.');
    try {
      await upsert.mutateAsync({
        userId,
        salaryType: type,
        amount: amt,
        probationRate: rate,
        effectiveFrom,
      });
      haptics.success();
      toast.success('Đã cập nhật cấu hình lương.', 'Thành công');
      onClose();
      onSaved();
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không lưu được');
    }
  }

  return (
    <Sheet
      visible={visible}
      title="Cấu hình lương"
      onClose={onClose}
      footer={
        <Button fullWidth loading={upsert.isPending} onPress={save} icon="content-save-outline">
          Lưu cấu hình lương
        </Button>
      }
    >
      <View className="gap-3">
        <Text variant="bodySmall" tone="muted">Nhân viên: <Text className="font-semibold">{userName}</Text></Text>

        <View>
          <Text variant="label" tone="muted" className="mb-1.5">LOẠI LƯƠNG</Text>
          <SegmentedControl
            segments={TYPES.map((t) => ({ key: t.key, label: t.label }))}
            value={type}
            onChange={(k) => setType(k as SalaryType)}
          />
        </View>

        <TextField
          label={`Số tiền (${unit})`}
          value={amount}
          onChangeText={setAmount}
          placeholder="Vd: 250000"
          keyboardType="number-pad"
        />
        <TextField
          label="Tỷ lệ thử việc % (tuỳ chọn)"
          value={probation}
          onChangeText={setProbation}
          placeholder="Vd: 85"
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextField
          label="Hiệu lực từ ngày"
          value={effectiveFrom}
          onChangeText={setEffectiveFrom}
          placeholder="2026-07-01"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />

        {current ? (
          <Text variant="caption" tone="muted">
            Hiện tại: {Number(current.amount).toLocaleString('vi-VN')} {TYPES.find((t) => t.key === current.salaryType)?.unit ?? ''} · từ {dayjs(current.effectiveFrom).format('DD/MM/YYYY')}
          </Text>
        ) : null}
        {error ? <Text variant="bodySmall" tone="error">{error}</Text> : null}
        <Text variant="caption" tone="muted">
          Lưu xong hãy "Tính lại lương" để áp mức mới vào bảng lương kỳ này.
        </Text>
      </View>
    </Sheet>
  );
}
