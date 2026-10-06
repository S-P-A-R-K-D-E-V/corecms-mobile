import { useEffect, useMemo, useState } from 'react';
import { View, TextInput } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Text, Icon, Pressable, Button, Chip } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { grey } from 'src/theme';
import { t } from 'src/i18n';
import type { IFnbMenu, IMenuDish } from 'src/types/fnb';

import { money } from 'src/features/erp/shared';
import { allowedToppings, defaultVariant, quickNotesFor, sortedVariants, variantSoldOut } from './menu';
import {
  draftAmount,
  itemDraft,
  openItemDraft,
  MAX_NOTE_LEN,
  MAX_OPEN_ITEM_NAME,
  MAX_QTY,
  MAX_QUICK_NOTES,
  MAX_TOPPING_QTY,
  type DraftLine,
} from './draft';

// ----------------------------------------------------------------------
// Bảng chọn món: size, món thêm (số phần cho MỘT ly / phần), ghi chú nhanh, ghi chú tự gõ, số lượng.
// Bảng món tự do: tên + giá + số lượng + ghi chú (máy chủ lưu vào sản phẩm "Món khác").
// ----------------------------------------------------------------------

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center rounded-xl border border-line dark:border-line-dark">
      <Pressable disabled={value <= min} onPress={() => onChange(value - 1)} hitSlop={6} className="w-10 h-10 items-center justify-center">
        <Icon name="minus" size={18} tone={value <= min ? 'faint' : 'default'} />
      </Pressable>
      <Text className="min-w-[32px] text-center font-bold" style={{ fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Pressable disabled={value >= max} onPress={() => onChange(value + 1)} hitSlop={6} className="w-10 h-10 items-center justify-center">
        <Icon name="plus" size={18} tone={value >= max ? 'faint' : 'primary'} />
      </Pressable>
    </View>
  );
}

const inputClass = 'min-h-11 px-3 rounded-2xl border border-line dark:border-line-dark text-ink dark:text-ink-dark';

export function DishOptionsSheet({
  menu,
  dish,
  onClose,
  onAdd,
}: {
  menu: IFnbMenu | undefined;
  dish: IMenuDish | null;
  onClose: () => void;
  onAdd: (line: DraftLine) => void;
}) {
  const variants = useMemo(() => (dish ? sortedVariants(dish) : []), [dish]);
  const toppings = useMemo(() => (dish ? allowedToppings(menu, dish) : []), [menu, dish]);
  const notes = useMemo(() => quickNotesFor(menu, dish), [menu, dish]);

  const [variantId, setVariantId] = useState<string | null>(null);
  const [topQty, setTopQty] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!dish) return;
    setVariantId(defaultVariant(dish)?.productId ?? null);
    setTopQty({});
    setPicked([]);
    setNote('');
    setQty(1);
  }, [dish]);

  const variant = variants.find((v) => v.productId === variantId) ?? null;
  const preview =
    dish && variant
      ? itemDraft(dish, variant, {
          quantity: qty,
          toppings: toppings.map((tp) => ({ productId: tp.productId, name: tp.name, unitPrice: tp.price, quantity: topQty[tp.productId] ?? 0 })),
          quickNotes: picked,
          note,
        })
      : null;

  return (
    <Sheet
      visible={!!dish}
      title={dish?.name}
      onClose={onClose}
      footer={
        <View className="flex-row items-center gap-3">
          <Stepper value={qty} min={1} max={MAX_QTY} onChange={setQty} />
          <View className="flex-1">
            <Button icon="plus" disabled={!preview} onPress={() => preview && onAdd(preview)}>
              {t('fnb.addToOrder', { amount: money(preview ? draftAmount(preview) : 0) })}
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-4">
        {variants.length > 1 ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">{t('fnb.size')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {variants.map((v) => {
                const out = !!dish && variantSoldOut(dish, v);
                const on = v.productId === variantId;
                return (
                  <Pressable
                    key={v.productId}
                    disabled={out}
                    onPress={() => setVariantId(v.productId)}
                    className={cn(
                      'min-w-[88px] px-3 py-2 rounded-2xl border items-center',
                      on ? 'bg-primary-soft border-primary' : 'border-line dark:border-line-dark',
                      out && 'opacity-40'
                    )}
                  >
                    <Text variant="bodySmall" tone={on ? 'primary' : 'default'} className="font-bold">{v.name ?? dish?.name}</Text>
                    <Text variant="caption" tone={out ? 'error' : 'muted'}>{out ? t('fnb.soldOut') : money(v.price)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {toppings.length ? (
          <View className="gap-1">
            <Text variant="label" tone="muted">{t('fnb.toppings')}</Text>
            {toppings.map((tp) => {
              const n = topQty[tp.productId] ?? 0;
              return (
                <View key={tp.productId} className={cn('flex-row items-center gap-3 py-1.5', tp.isSoldOut && 'opacity-40')}>
                  <View className="flex-1">
                    <Text variant="bodySmall" className="font-semibold">{tp.name}</Text>
                    <Text variant="caption" tone={tp.isSoldOut ? 'error' : 'muted'}>{tp.isSoldOut ? t('fnb.soldOut') : `+${money(tp.price)}`}</Text>
                  </View>
                  {tp.isSoldOut ? null : (
                    <Stepper value={n} min={0} max={MAX_TOPPING_QTY} onChange={(v) => setTopQty((m) => ({ ...m, [tp.productId]: v }))} />
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {notes.length ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">{t('fnb.quickNotes')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {notes.map((n) => {
                const on = picked.includes(n.text);
                return (
                  <Chip
                    key={n.id}
                    label={n.text}
                    selected={on}
                    color="primary"
                    onPress={() =>
                      setPicked((p) => (on ? p.filter((x) => x !== n.text) : p.length < MAX_QUICK_NOTES ? [...p, n.text] : p))
                    }
                  />
                );
              })}
            </View>
          </View>
        ) : null}

        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={MAX_NOTE_LEN}
          placeholder={t('fnb.note')}
          placeholderTextColor={grey[500]}
          className={inputClass}
        />
      </View>
    </Sheet>
  );
}

export function OpenItemSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (line: DraftLine) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!visible) return;
    setName('');
    setPrice('');
    setNote('');
    setQty(1);
  }, [visible]);

  const unitPrice = Number(price.replace(/[^0-9]/g, '') || '0');
  const ok = name.trim().length > 0;

  return (
    <Sheet
      visible={visible}
      title={t('fnb.openItem')}
      onClose={onClose}
      footer={
        <View className="flex-row items-center gap-3">
          <Stepper value={qty} min={1} max={MAX_QTY} onChange={setQty} />
          <View className="flex-1">
            <Button icon="plus" disabled={!ok} onPress={() => onAdd(openItemDraft({ name, unitPrice, quantity: qty, note }))}>
              {t('fnb.addToOrder', { amount: money(unitPrice * qty) })}
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-3">
        <TextInput
          value={name}
          onChangeText={setName}
          maxLength={MAX_OPEN_ITEM_NAME}
          placeholder={t('fnb.openItemName')}
          placeholderTextColor={grey[500]}
          className={inputClass}
          autoFocus
        />
        <TextInput
          value={unitPrice ? unitPrice.toLocaleString('vi-VN') : price}
          onChangeText={(v) => setPrice(v.replace(/[^0-9]/g, '').slice(0, 9))}
          placeholder={t('fnb.openItemPrice')}
          placeholderTextColor={grey[500]}
          keyboardType="number-pad"
          className={inputClass}
        />
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={MAX_NOTE_LEN}
          placeholder={t('fnb.note')}
          placeholderTextColor={grey[500]}
          className={inputClass}
        />
      </View>
    </Sheet>
  );
}
