import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Text, Button, TextField, Badge } from 'src/components/ui';
import { formatAmountInput, parseAmount } from './utils';
import type { IShiftCashTransaction } from 'src/types/corecms-api';

export type TxDraft = { type: 'Thu' | 'Chi'; amount: number; note?: string };

export type TransactionSheetProps = {
  visible: boolean;
  mode: 'add' | 'edit';
  type: 'Thu' | 'Chi';
  /** Bản ghi đang sửa (mode 'edit'). */
  editing?: IShiftCashTransaction | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (draft: TxDraft) => void;
};

export function TransactionSheet({
  visible,
  mode,
  type,
  editing,
  saving,
  onClose,
  onSubmit,
}: TransactionSheetProps) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // Nạp lại giá trị mỗi khi mở sheet.
  useEffect(() => {
    if (!visible) return;
    setAmount(mode === 'edit' && editing ? formatAmountInput(String(editing.amount)) : '');
    setNote(mode === 'edit' && editing ? (editing.note ?? '') : '');
  }, [visible, mode, editing]);

  const numeric = Number(parseAmount(amount));
  const valid = numeric > 0;
  const isThu = type === 'Thu';
  const title = `${mode === 'add' ? 'Thêm' : 'Sửa'} khoản ${isThu ? 'thu' : 'chi'}`;

  return (
    <Sheet
      visible={visible}
      title={title}
      onClose={onClose}
      footer={
        <Button
          action={isThu ? 'primary' : 'error'}
          loading={saving}
          disabled={!valid}
          icon="check"
          onPress={() => onSubmit({ type, amount: numeric, note: note.trim() || undefined })}
        >
          {mode === 'add' ? 'Thêm' : 'Lưu thay đổi'}
        </Button>
      }
    >
      <View className="gap-4 pb-2">
        <View className="flex-row items-center gap-2">
          <Badge tone={isThu ? 'success' : 'error'} icon={isThu ? 'arrow-down-bold' : 'arrow-up-bold'}>
            {isThu ? 'Tiền thu vào quầy' : 'Tiền chi từ quầy'}
          </Badge>
        </View>

        <TextField
          label="Số tiền (đ)"
          icon="cash"
          keyboardType="number-pad"
          placeholder="0"
          value={amount}
          onChangeText={(v) => setAmount(formatAmountInput(v))}
        />

        <TextField
          label="Ghi chú"
          icon="text"
          placeholder="VD: tiền ship, mua đồ dùng…"
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={2}
        />

        {valid ? (
          <Text tone="muted" variant="bodySmall">
            {isThu ? '+' : '−'} {formatAmountInput(amount)}đ
          </Text>
        ) : null}
      </View>
    </Sheet>
  );
}
