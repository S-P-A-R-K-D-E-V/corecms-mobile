import { useEffect, useMemo, useState } from 'react';
import { View, TextInput, ScrollView } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Text, Icon, Pressable, Button, Chip, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { grey } from 'src/theme';
import { t } from 'src/i18n';
import type { IFnbFloor, IOpenOrder } from 'src/types/fnb';

import { moveOptions, type MoveOption } from './floor';
import { allLinesSelection, lineTitle, movableLines, moveSelection, voidableLines, voidSelection, type QtySelection } from './order-view';

// ----------------------------------------------------------------------
// Bảng thao tác trên món đã có trong đơn: huỷ món đã gửi (bắt buộc lý do), chuyển món (đổi bàn / gộp / tách),
// huỷ cả đơn. Chỉ dựng lệnh — màn gọi món xếp lệnh vào hàng đợi.
// ----------------------------------------------------------------------

const REASON_KEYS = ['reasonCustomerChanged', 'reasonCustomerCancel', 'reasonWrongEntry', 'reasonOutOfStock'] as const;

function QtyPick({ value, max, onChange }: { value: number; max: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center rounded-xl border border-line dark:border-line-dark">
      <Pressable disabled={value <= 0} onPress={() => onChange(value - 1)} hitSlop={6} className="w-9 h-9 items-center justify-center">
        <Icon name="minus" size={18} tone={value <= 0 ? 'faint' : 'default'} />
      </Pressable>
      <Text className="min-w-[44px] text-center font-bold" style={{ fontVariant: ['tabular-nums'] }}>{`${value}/${max}`}</Text>
      <Pressable disabled={value >= max} onPress={() => onChange(value + 1)} hitSlop={6} className="w-9 h-9 items-center justify-center">
        <Icon name="plus" size={18} tone={value >= max ? 'faint' : 'primary'} />
      </Pressable>
    </View>
  );
}

function ReasonPicker({ reason, onChange }: { reason: string; onChange: (s: string) => void }) {
  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">{t('fnb.reason')}</Text>
      <View className="flex-row flex-wrap gap-2">
        {REASON_KEYS.map((k) => {
          const label = t(`fnb.${k}`);
          return <Chip key={k} label={label} selected={reason === label} color="primary" onPress={() => onChange(label)} />;
        })}
      </View>
      <TextInput
        value={reason}
        onChangeText={onChange}
        maxLength={255}
        placeholder={t('fnb.reasonPlaceholder')}
        placeholderTextColor={grey[500]}
        className="min-h-11 px-3 rounded-2xl border border-line dark:border-line-dark text-ink dark:text-ink-dark"
      />
    </View>
  );
}

function MadeToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      className={cn('flex-row items-center gap-2.5 px-3.5 py-3 rounded-2xl border', value ? 'bg-warning-soft border-warning' : 'border-line dark:border-line-dark')}
    >
      <Icon name={value ? 'checkbox-marked' : 'checkbox-blank-outline'} size={22} tone={value ? 'warning' : 'muted'} />
      <Text variant="bodySmall" className="font-semibold flex-1">{t('fnb.alreadyMade')}</Text>
    </Pressable>
  );
}

const ManagerNote = () => (
  <View className="flex-row items-start gap-2 rounded-2xl bg-warning-soft px-3.5 py-3">
    <Icon name="shield-account-outline" size={18} tone="warning" />
    <Text variant="bodySmall" className="flex-1">{t('fnb.managerRequired')}</Text>
  </View>
);

export function VoidSheet({
  order,
  focusLineId,
  visible,
  blockedByRole,
  onClose,
  onConfirm,
}: {
  order: IOpenOrder | undefined;
  focusLineId: string | null;
  visible: boolean;
  /** Đã in tạm tính mà người dùng không phải quản lý. */
  blockedByRole: boolean;
  onClose: () => void;
  onConfirm: (input: { reason: string; alreadyMade: boolean; lines: { lineId: string; quantity: number }[] }) => void;
}) {
  const [sel, setSel] = useState<QtySelection>({});
  const [reason, setReason] = useState('');
  const [made, setMade] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSel(focusLineId ? { [focusLineId]: 1 } : {});
    setReason('');
    setMade(false);
  }, [visible, focusLineId]);

  const lines = voidableLines(order);
  const picked = order ? voidSelection(order, sel) : [];
  const n = picked.reduce((s, x) => s + x.quantity, 0);
  const ok = n > 0 && reason.trim().length > 0 && !blockedByRole;

  return (
    <Sheet
      visible={visible}
      title={t('fnb.voidTitle')}
      onClose={onClose}
      footer={
        <Button action="error" icon="close-circle-outline" disabled={!ok} onPress={() => onConfirm({ reason, alreadyMade: made, lines: picked })}>
          {t('fnb.confirmVoid', { n })}
        </Button>
      }
    >
      <View className="gap-3">
        {blockedByRole ? <ManagerNote /> : null}
        <View>
          {lines.map((l, i) => (
            <View key={l.id}>
              {i > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-2 py-2">
                <Text variant="bodySmall" className="flex-1 font-semibold">{lineTitle(l)}</Text>
                <QtyPick value={sel[l.id] ?? 0} max={l.quantity} onChange={(v) => setSel((m) => ({ ...m, [l.id]: v }))} />
              </View>
            </View>
          ))}
        </View>
        <ReasonPicker reason={reason} onChange={setReason} />
        <MadeToggle value={made} onChange={setMade} />
      </View>
    </Sheet>
  );
}

const optionLabel = (o: MoveOption) => {
  if (o.kind === 'existing') {
    return o.tableName ? t('fnb.mergeInto', { table: o.tableName, no: o.displayNo }) : t('fnb.mergeTakeaway', { no: o.displayNo });
  }
  return o.tableName ? t('fnb.newOrderAt', { table: o.tableName }) : t('fnb.takeawayNew');
};

export function MoveSheet({
  order,
  floor,
  visible,
  onClose,
  onConfirm,
}: {
  order: IOpenOrder | undefined;
  floor: IFnbFloor | undefined;
  visible: boolean;
  onClose: () => void;
  onConfirm: (target: MoveOption, lines: { lineId: string; quantity: number; newLineId: string | null }[], all: boolean) => void;
}) {
  const [sel, setSel] = useState<QtySelection>({});
  const [targetKey, setTargetKey] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !order) return;
    setSel(allLinesSelection(order));
    setTargetKey(null);
  }, [visible, order?.id]);

  const lines = movableLines(order);
  const options = useMemo(() => (order ? moveOptions(floor, order.id) : []), [floor, order]);
  const target = options.find((o) => o.key === targetKey) ?? null;
  const n = lines.reduce((s, l) => s + Math.min(l.quantity, sel[l.id] ?? 0), 0);
  const all = lines.every((l) => (sel[l.id] ?? 0) >= l.quantity);

  return (
    <Sheet
      visible={visible}
      title={t('fnb.moveTitle')}
      onClose={onClose}
      footer={
        <Button icon="swap-horizontal" disabled={!order || !target || n === 0} onPress={() => order && target && onConfirm(target, moveSelection(order, sel), all)}>
          {t('fnb.confirmMove', { n })}
        </Button>
      }
    >
      <View className="gap-3">
        <View>
          <View className="flex-row justify-end">
            <Pressable onPress={() => order && setSel(all ? {} : allLinesSelection(order))} hitSlop={8}>
              <Text variant="caption" tone="primary" className="font-semibold">{all ? t('fnb.selectNone') : t('fnb.selectAll')}</Text>
            </Pressable>
          </View>
          {lines.map((l, i) => (
            <View key={l.id}>
              {i > 0 ? <Divider /> : null}
              <View className="flex-row items-center gap-2 py-2">
                <Text variant="bodySmall" className="flex-1 font-semibold">{lineTitle(l)}</Text>
                <QtyPick value={sel[l.id] ?? 0} max={l.quantity} onChange={(v) => setSel((m) => ({ ...m, [l.id]: v }))} />
              </View>
            </View>
          ))}
        </View>
        <Text variant="label" tone="muted">{t('fnb.moveTo')}</Text>
        <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
          <View className="flex-row flex-wrap gap-2">
            {options.map((o) => (
              <Chip
                key={o.key}
                icon={o.kind === 'existing' ? 'call-merge' : o.tableId ? 'table-furniture' : 'shopping-outline'}
                label={optionLabel(o)}
                selected={o.key === targetKey}
                color="primary"
                onPress={() => setTargetKey(o.key)}
              />
            ))}
          </View>
        </ScrollView>
      </View>
    </Sheet>
  );
}

export function CancelOrderSheet({
  visible,
  hasSentLines,
  blockedByRole,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  hasSentLines: boolean;
  blockedByRole: boolean;
  onClose: () => void;
  onConfirm: (input: { reason: string | null; alreadyMade: boolean }) => void;
}) {
  const [reason, setReason] = useState('');
  const [made, setMade] = useState(false);
  useEffect(() => {
    if (visible) {
      setReason('');
      setMade(false);
    }
  }, [visible]);
  const ok = !blockedByRole && (!hasSentLines || reason.trim().length > 0);

  return (
    <Sheet
      visible={visible}
      title={t('fnb.cancelTitle')}
      onClose={onClose}
      footer={
        <Button action="error" icon="delete-outline" disabled={!ok} onPress={() => onConfirm({ reason: reason.trim() || null, alreadyMade: made })}>
          {t('fnb.cancelOrder')}
        </Button>
      }
    >
      <View className="gap-3">
        {blockedByRole ? <ManagerNote /> : null}
        {hasSentLines ? (
          <>
            <ReasonPicker reason={reason} onChange={setReason} />
            <MadeToggle value={made} onChange={setMade} />
          </>
        ) : (
          <Text variant="bodySmall" tone="muted">{t('fnb.cancelNoSentHint')}</Text>
        )}
      </View>
    </Sheet>
  );
}
