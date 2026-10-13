import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Button, Chip, Pressable, Text, TextField } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { t } from 'src/i18n';
import type { IOpenOrder } from 'src/types/fnb';

import { money } from 'src/features/erp/shared';
import { lineTitle } from './order-view';
import { MAX_REASON, discountAmount, discountInput, parseDong, priceInput, priceableLines, type DiscountType } from './order-extras';

// ----------------------------------------------------------------------
// Việc của quản lý trên một đơn mở: giảm giá toàn đơn (phần trăm / số tiền, bắt buộc lý do, bỏ giảm giá) và sửa giá một
// dòng (bắt buộc lý do, trả về giá niêm yết). Máy chủ kiểm tra quyền và tính tiền; app chỉ xem trước.
// ----------------------------------------------------------------------

export function DiscountSheet({
  order,
  visible,
  onClose,
  onConfirm,
}: {
  order: IOpenOrder | null | undefined;
  visible: boolean;
  onClose: () => void;
  onConfirm: (input: { type: DiscountType; value: number; reason: string } | null) => void | Promise<void>;
}) {
  const [type, setType] = useState<DiscountType>('Percent');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    const current = order?.discount;
    setType(current?.type === 'Amount' ? 'Amount' : 'Percent');
    setValue(current ? String(current.value) : '');
    setReason(current?.reason ?? '');
  }, [visible, order?.discount]);

  const subtotal = order?.totals.subtotal ?? 0;
  const input = discountInput(type, value, reason, subtotal);
  const preview = discountAmount(type, parseDong(value) ?? 0, subtotal);

  return (
    <Sheet
      visible={visible}
      title={t('fnbExtras.discountTitle')}
      onClose={onClose}
      footer={
        <View className="flex-row items-center gap-3">
          {order?.discount ? (
            <View className="flex-1">
              <Button variant="outline" icon="close" onPress={() => void onConfirm(null)}>{t('fnbExtras.discountClear')}</Button>
            </View>
          ) : null}
          <View className="flex-1">
            <Button icon="check" disabled={!input} onPress={() => input && void onConfirm(input)}>{t('fnbExtras.apply')}</Button>
          </View>
        </View>
      }
    >
      <View className="gap-4">
        <View className="flex-row gap-2">
          <Chip label={t('fnbExtras.percent')} selected={type === 'Percent'} color="primary" onPress={() => setType('Percent')} />
          <Chip label={t('fnbExtras.amount')} selected={type === 'Amount'} color="primary" onPress={() => setType('Amount')} />
        </View>
        <TextField
          label={type === 'Percent' ? t('fnbExtras.percentValue') : t('fnbExtras.amountValue')}
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          maxLength={11}
        />
        <TextField label={t('fnbExtras.reason')} value={reason} onChangeText={setReason} maxLength={MAX_REASON} />
        <View className="flex-row items-center justify-between">
          <Text variant="bodySmall" tone="muted">{t('fnbExtras.subtotal', { amount: money(subtotal) })}</Text>
          <Text variant="body" tone="success" className="font-bold">−{money(preview)}</Text>
        </View>
      </View>
    </Sheet>
  );
}

export function PriceSheet({
  order,
  visible,
  onClose,
  onConfirm,
}: {
  order: IOpenOrder | null | undefined;
  visible: boolean;
  onClose: () => void;
  onConfirm: (lineId: string, input: { unitPrice: number; reason: string } | null) => void | Promise<void>;
}) {
  const lines = priceableLines(order);
  const [lineId, setLineId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLineId(null);
    setPrice('');
    setReason('');
  }, [visible]);

  const line = lines.find((l) => l.id === lineId) ?? null;
  const input = line ? priceInput(line, price, reason) : null;

  return (
    <Sheet
      visible={visible}
      title={t('fnbExtras.priceTitle')}
      onClose={onClose}
      footer={
        line ? (
          <View className="flex-row items-center gap-3">
            {line.priceOverride ? (
              <View className="flex-1">
                <Button variant="outline" icon="restore" onPress={() => void onConfirm(line.id, null)}>{t('fnbExtras.priceRestore')}</Button>
              </View>
            ) : null}
            <View className="flex-1">
              <Button icon="check" disabled={!input} onPress={() => input && void onConfirm(line.id, input)}>{t('fnbExtras.apply')}</Button>
            </View>
          </View>
        ) : undefined
      }
    >
      <View className="gap-3">
        <Text variant="label" tone="muted">{t('fnbExtras.pricePick')}</Text>
        {lines.map((l) => {
          const on = l.id === lineId;
          return (
            <Pressable
              key={l.id}
              onPress={() => { setLineId(l.id); setPrice(''); }}
              className={cn('flex-row items-center gap-2 px-3 py-2 rounded-2xl border', on ? 'bg-primary-soft border-primary' : 'border-line dark:border-line-dark')}
            >
              <Text variant="bodySmall" tone={on ? 'primary' : 'default'} className="flex-1 font-semibold">{lineTitle(l)} ×{l.quantity}</Text>
              <View className="items-end">
                <Text variant="bodySmall">{money(l.unitPrice)}</Text>
                {l.priceOverride ? <Text variant="caption" tone="warning">{t('fnbExtras.priceWas', { amount: money(l.listPrice) })}</Text> : null}
              </View>
            </Pressable>
          );
        })}
        {lines.length === 0 ? <Text variant="bodySmall" tone="muted" className="py-4 text-center">{t('fnbExtras.priceNoLines')}</Text> : null}

        {line ? (
          <View className="gap-3">
            <TextField label={t('fnbExtras.priceNew')} value={price} onChangeText={setPrice} keyboardType="number-pad" maxLength={11} />
            <TextField label={t('fnbExtras.reason')} value={reason} onChangeText={setReason} maxLength={MAX_REASON} />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
