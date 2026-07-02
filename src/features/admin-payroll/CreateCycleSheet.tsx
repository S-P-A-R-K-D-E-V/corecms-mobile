import { useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Sheet } from 'src/components/shared';
import { Button, Text, TextField, Icon, Pressable, SegmentedControl } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';

import { useCreatePayrollCycle, useGenerateBatch } from './hooks';

// ----------------------------------------------------------------------
// Tạo chu kỳ lương. Hai chế độ:
//   Theo tháng  → chọn tháng (◀ ▶), tự điền tên + from/to (1 → cuối tháng).
//   Tùy chỉnh   → nhập tên + from/to (yyyy-MM-dd) thủ công.
// Hai hành động: "Tạo chu kỳ" (trống) và "Tạo & tính lương" (tính mọi NV).
// ----------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function CreateCycleSheet({
  visible,
  onClose,
  onGenerated,
}: {
  visible: boolean;
  onClose: () => void;
  /** Gọi khi "Tạo & tính lương" xong — điều hướng sang chi tiết cycle. */
  onGenerated: (cycleId: string) => void;
}) {
  const createM = useCreatePayrollCycle();
  const batchM = useGenerateBatch();

  const [mode, setMode] = useState<'monthly' | 'custom'>('monthly');
  const [month, setMonth] = useState(() => dayjs().startOf('month'));
  const [name, setName] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [workDays, setWorkDays] = useState('26');
  const [error, setError] = useState('');

  // Giá trị hiệu lực theo chế độ.
  const resolved = useMemo(() => {
    if (mode === 'monthly') {
      return {
        name: `Lương tháng ${month.format('M/YYYY')}`,
        fromDate: month.startOf('month').format('YYYY-MM-DD'),
        toDate: month.endOf('month').format('YYYY-MM-DD'),
      };
    }
    return { name: name.trim(), fromDate: fromDate.trim(), toDate: toDate.trim() };
  }, [mode, month, name, fromDate, toDate]);

  function validate(): string | null {
    if (!resolved.name) return 'Nhập tên chu kỳ.';
    if (!DATE_RE.test(resolved.fromDate) || !DATE_RE.test(resolved.toDate)) return 'Ngày phải dạng yyyy-MM-dd.';
    if (resolved.toDate < resolved.fromDate) return 'Ngày kết thúc phải sau ngày bắt đầu.';
    return null;
  }

  async function onCreate() {
    const err = validate();
    if (err) return setError(err);
    setError('');
    const days = Number(workDays) || 26;
    try {
      await createM.mutateAsync({
        name: resolved.name,
        cycleType: mode === 'monthly' ? 'Monthly' : 'Custom',
        fromDate: resolved.fromDate,
        toDate: resolved.toDate,
        standardWorkDays: days,
      });
      haptics.success();
      toast.success('Đã tạo chu kỳ lương.', 'Thành công');
      onClose();
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không tạo được');
    }
  }

  async function onGenerate() {
    const err = validate();
    if (err) return setError(err);
    setError('');
    try {
      const res = await batchM.mutateAsync({
        periodName: resolved.name,
        fromDate: resolved.fromDate,
        toDate: resolved.toDate,
      });
      haptics.success();
      toast.success(`Đã tính lương ${res.successCount} NV (bỏ qua ${res.skippedCount}).`, 'Tạo & tính lương');
      onClose();
      onGenerated(res.payrollCycleId);
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không tính được');
    }
  }

  const busy = createM.isPending || batchM.isPending;

  return (
    <Sheet
      visible={visible}
      title="Tạo chu kỳ lương"
      onClose={onClose}
      footer={
        <View className="gap-2">
          <Button fullWidth loading={batchM.isPending} disabled={createM.isPending} onPress={onGenerate} icon="cash-sync">
            Tạo & tính lương
          </Button>
          <Button variant="soft" action="neutral" fullWidth loading={createM.isPending} disabled={batchM.isPending} onPress={onCreate}>
            Chỉ tạo chu kỳ (trống)
          </Button>
        </View>
      }
    >
      <View className="gap-3">
        <SegmentedControl
          segments={[{ key: 'monthly', label: 'Theo tháng' }, { key: 'custom', label: 'Tùy chỉnh' }]}
          value={mode}
          onChange={(k) => setMode(k as 'monthly' | 'custom')}
        />

        {mode === 'monthly' ? (
          <View className="flex-row items-center justify-between rounded-2xl bg-surface dark:bg-surface-dark p-3">
            <Pressable onPress={() => { haptics.light(); setMonth((m) => m.subtract(1, 'month')); }} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-bg-dark">
              <Icon name="chevron-left" size={20} tone="muted" />
            </Pressable>
            <View className="items-center">
              <Text variant="caption" tone="muted">Kỳ lương</Text>
              <Text variant="subtitle">Tháng {month.format('M/YYYY')}</Text>
              <Text variant="caption" tone="muted">{resolved.fromDate} → {resolved.toDate}</Text>
            </View>
            <Pressable onPress={() => { haptics.light(); setMonth((m) => m.add(1, 'month')); }} hitSlop={8} className="w-9 h-9 items-center justify-center rounded-full bg-bg dark:bg-bg-dark">
              <Icon name="chevron-right" size={20} tone="muted" />
            </Pressable>
          </View>
        ) : (
          <>
            <TextField label="Tên chu kỳ" value={name} onChangeText={setName} placeholder="Vd: Lương đợt 1 tháng 7" />
            <View className="flex-row gap-3">
              <View className="flex-1"><TextField label="Từ ngày" value={fromDate} onChangeText={setFromDate} placeholder="2026-07-01" keyboardType="numbers-and-punctuation" maxLength={10} /></View>
              <View className="flex-1"><TextField label="Đến ngày" value={toDate} onChangeText={setToDate} placeholder="2026-07-15" keyboardType="numbers-and-punctuation" maxLength={10} /></View>
            </View>
          </>
        )}

        <TextField label="Ngày công chuẩn" value={workDays} onChangeText={setWorkDays} placeholder="26" keyboardType="number-pad" maxLength={2} />

        {error ? <Text variant="bodySmall" tone="error">{error}</Text> : null}
        <Text variant="caption" tone="muted">
          "Tạo & tính lương" sẽ tạo chu kỳ và tính lương cho toàn bộ nhân viên có ca trong khoảng.
          {busy ? ' Đang xử lý…' : ''}
        </Text>
      </View>
    </Sheet>
  );
}
