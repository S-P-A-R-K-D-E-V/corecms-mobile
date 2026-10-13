import { useEffect, useMemo, useState } from 'react';
import { View, TextInput } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Text, Icon, Pressable, Button, Chip } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { grey } from 'src/theme';
import { t } from 'src/i18n';
import type { IFnbMenu, IMenuDish } from 'src/types/fnb';

import { money } from 'src/features/erp/shared';
import { allowedToppings, componentTitle, defaultVariant, quickNotesFor, sortedVariants, variantSoldOut } from './menu';
import {
  draftAmount,
  comboComponents,
  itemDraft,
  openItemDraft,
  MAX_NOTE_LEN,
  MAX_OPEN_ITEM_NAME,
  MAX_QTY,
  MAX_QUICK_NOTES,
  MAX_TOPPING_QTY,
  type DraftLine,
  type LineSeed,
} from './draft';

// ----------------------------------------------------------------------
// Bảng chọn món: size, món thêm (số phần cho MỘT ly / phần), ghi chú nhanh, ghi chú tự gõ, số lượng. Cũng dùng để SỬA
// một dòng chưa gửi (`editing`): mở với đúng lựa chọn của dòng, nút thành "Lưu".
// Bảng món tự do: tên + giá + số lượng + ghi chú (máy chủ lưu vào sản phẩm "Món khác").
// ----------------------------------------------------------------------

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
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
  editing = null,
  notice = null,
  onClose,
  onAdd,
}: {
  menu: IFnbMenu | undefined;
  dish: IMenuDish | null;
  /** Lựa chọn của dòng đang sửa; null = thêm món mới. */
  editing?: LineSeed | null;
  /** Dòng nhắc ở đầu bảng (vd dòng đang có giá sửa tay). */
  notice?: string | null;
  onClose: () => void;
  onAdd: (line: DraftLine) => void;
}) {
  const variants = useMemo(() => (dish ? sortedVariants(dish) : []), [dish]);
  // Combo không nhận món thêm.
  const toppings = useMemo(() => (dish && !dish.combo ? allowedToppings(menu, dish) : []), [menu, dish]);
  // Ghi chú nhanh của thực đơn, cộng ghi chú dòng đang giữ mà thực đơn không còn (để không lặng lẽ giữ hay làm mất).
  const noteTexts = useMemo(() => {
    const texts = quickNotesFor(menu, dish).map((n) => n.text);
    return [...texts, ...(editing?.quickNotes ?? []).filter((x) => !texts.includes(x))];
  }, [menu, dish, editing]);

  const [variantId, setVariantId] = useState<string | null>(null);
  const [topQty, setTopQty] = useState<Record<string, number>>({});
  // Combo: nhóm → productId đã chọn (nhóm chưa chọn lấy lựa chọn mặc định còn bán).
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!dish) return;
    // Size của dòng đang sửa không còn trên thực đơn thì về size mặc định.
    const kept = editing && dish.variants.some((v) => v.productId === editing.variantId) ? editing.variantId : null;
    setVariantId(kept ?? defaultVariant(dish)?.productId ?? null);
    setTopQty(editing?.toppings ?? {});
    setChoices(editing?.choices ?? {});
    setPicked(editing?.quickNotes ?? []);
    setNote(editing?.note ?? '');
    setQty(editing?.quantity ?? 1);
  }, [dish, editing]);

  const variant = variants.find((v) => v.productId === variantId) ?? null;
  const components = dish ? comboComponents(dish, choices) : [];
  // Lựa chọn đang giữ đã báo hết (cả nhóm hết): không cho thêm.
  const comboBlocked = components.some(
    (c) => dish?.combo?.groups.find((g) => g.id === c.groupId)?.options.find((o) => o.productId === c.productId)?.isSoldOut
  );
  const preview =
    dish && variant && !comboBlocked
      ? itemDraft(dish, variant, {
          quantity: qty,
          components,
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
            <Button icon={editing ? 'check' : 'plus'} disabled={!preview} onPress={() => preview && onAdd(preview)}>
              {t(editing ? 'fnb.saveLine' : 'fnb.addToOrder', { amount: money(preview ? draftAmount(preview) : 0) })}
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-4">
        {notice ? <Text variant="caption" tone="warning">{notice}</Text> : null}

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

        {dish?.combo?.groups.map((group) => {
          const chosen = components.find((c) => c.groupId === group.id)?.productId;
          return (
            <View key={group.id} className="gap-2">
              <Text variant="label" tone="muted">
                {group.options.length > 1 ? t('fnb.comboPickOne', { group: group.name }) : group.name}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {group.options.map((o) => {
                  const on = o.productId === chosen;
                  return (
                    <Pressable
                      key={o.productId}
                      disabled={o.isSoldOut}
                      onPress={() => setChoices((m) => ({ ...m, [group.id]: o.productId }))}
                      className={cn(
                        'min-w-[88px] px-3 py-2 rounded-2xl border items-center',
                        on ? 'bg-primary-soft border-primary' : 'border-line dark:border-line-dark',
                        o.isSoldOut && 'opacity-40'
                      )}
                    >
                      <Text variant="bodySmall" tone={on ? 'primary' : 'default'} className="font-bold">{componentTitle(o)}</Text>
                      <Text variant="caption" tone={o.isSoldOut ? 'error' : 'muted'}>
                        {o.isSoldOut ? t('fnb.soldOut') : o.surcharge > 0 ? `+${money(o.surcharge)}` : t('fnb.comboIncluded')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}

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

        {noteTexts.length ? (
          <View className="gap-2">
            <Text variant="label" tone="muted">{t('fnb.quickNotes')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {noteTexts.map((text, i) => {
                const on = picked.includes(text);
                return (
                  <Chip
                    key={`${i}-${text}`}
                    label={text}
                    selected={on}
                    color="primary"
                    onPress={() =>
                      setPicked((p) => (on ? p.filter((x) => x !== text) : p.length < MAX_QUICK_NOTES ? [...p, text] : p))
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
