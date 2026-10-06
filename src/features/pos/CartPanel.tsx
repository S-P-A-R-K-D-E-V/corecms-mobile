import { useState } from 'react';
import { View, TextInput } from 'react-native';
import { useColorScheme } from 'nativewind';

import { EmptyState } from 'src/components/shared';
import { Text, Icon, Pressable, Divider } from 'src/components/ui';
import { brand } from 'src/theme';
import { t } from 'src/i18n';

import { money, fmtQty } from 'src/features/erp/shared';
import { useCart, type CartLine } from './cart-store';

// ----------------------------------------------------------------------
// Giỏ hàng: các dòng hàng (đổi số lượng, quản lý sửa giá). Chỉ là phần thân — không tự cuộn, không có nút chân;
// màn chứa đặt vào bảng trượt (điện thoại) hoặc khung bên phải (tablet xoay ngang).
// ----------------------------------------------------------------------

/** Nút −/+ số lượng; ở 1 thì nút trừ thành xoá dòng. */
export function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center rounded-xl border border-line dark:border-line-dark">
      <Pressable onPress={() => onChange(value - 1)} hitSlop={6} className="w-9 h-9 items-center justify-center">
        <Icon name={value <= 1 ? 'trash-can-outline' : 'minus'} size={18} tone={value <= 1 ? 'error' : 'default'} />
      </Pressable>
      <Text className="min-w-[28px] text-center font-bold" style={{ fontVariant: ['tabular-nums'] }}>{fmtQty(value)}</Text>
      <Pressable onPress={() => onChange(value + 1)} hitSlop={6} className="w-9 h-9 items-center justify-center">
        <Icon name="plus" size={18} tone="primary" />
      </Pressable>
    </View>
  );
}

/** Một dòng trong giỏ: tên, thành tiền, giá (quản lý bấm để sửa), số lượng. */
export function CartLineRow({ line, canEditPrice }: { line: CartLine; canEditPrice: boolean }) {
  const { colorScheme } = useColorScheme();
  const setQty = useCart((s) => s.setQty);
  const setPrice = useCart((s) => s.setPrice);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(line.price));
  const changed = line.price !== line.listPrice;

  return (
    <View className="py-2.5 gap-1.5">
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{line.name}</Text>
          <Text variant="caption" tone="muted">
            {line.code}
            {line.qty > line.stock ? `  ·  ${t('erp.stock', { n: fmtQty(line.stock) })}` : ''}
          </Text>
        </View>
        <Text variant="bodySmall" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{money(line.price * line.qty)}</Text>
      </View>
      <View className="flex-row items-center justify-between">
        {canEditPrice && editing ? (
          <View className="flex-row items-center gap-2">
            <TextInput
              value={text}
              onChangeText={(v) => setText(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              autoFocus
              onBlur={() => {
                setPrice(line.key, Number(text || 0));
                setEditing(false);
              }}
              style={{
                minWidth: 110,
                height: 36,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: brand.primary,
                fontWeight: '700',
                color: colorScheme === 'dark' ? '#FFFFFF' : brand.ink,
              }}
            />
          </View>
        ) : (
          <Pressable
            disabled={!canEditPrice}
            onPress={() => {
              setText(String(line.price));
              setEditing(true);
            }}
            className="flex-row items-center gap-1"
          >
            <Text variant="caption" tone={changed ? 'warning' : 'muted'} className="font-semibold">
              {money(line.price)}
              {changed ? `  (${money(line.listPrice)})` : ''}
            </Text>
            <Icon name={canEditPrice ? 'pencil-outline' : 'lock-outline'} size={13} tone="faint" />
          </Pressable>
        )}
        <QtyStepper value={line.qty} onChange={(n) => setQty(line.key, n)} />
      </View>
    </View>
  );
}

export function CartPanel({ lines, canEditPrice }: { lines: CartLine[]; canEditPrice: boolean }) {
  if (lines.length === 0) return <EmptyState icon="cart-outline" title={t('erp.emptyCart')} />;
  return (
    <View>
      {!canEditPrice ? (
        <View className="flex-row items-center gap-1.5 mb-1">
          <Icon name="lock-outline" size={13} tone="muted" />
          <Text variant="caption" tone="muted">{t('erp.priceLocked')}</Text>
        </View>
      ) : null}
      {lines.map((l, i) => (
        <View key={l.key}>
          {i > 0 ? <Divider /> : null}
          <CartLineRow line={l} canEditPrice={canEditPrice} />
        </View>
      ))}
    </View>
  );
}
