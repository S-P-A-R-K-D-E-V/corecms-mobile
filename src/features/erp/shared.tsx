import { useEffect, useState } from 'react';
import { View, TextInput, Image } from 'react-native';
import { useColorScheme } from 'nativewind';

import { Text, Icon, Pressable, Badge, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand, grey } from 'src/theme';
import { formatMoney } from 'src/i18n/format';
import { getStorageUrl } from 'src/api/axios';
import { t } from 'src/i18n';
import type { IProductChild, IProductInventory, IProductListItem } from 'src/types/erp';

import { syncBadge } from './kiotviet-sync';

// ----------------------------------------------------------------------
// Mảnh dùng chung cho Hàng hoá / Bán hàng / Hoá đơn / Nhập hàng.
// ----------------------------------------------------------------------

export const money = (v?: number | null) => formatMoney(v ?? 0);

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const sumOnHand = (inv?: IProductInventory[] | null) => (inv ?? []).reduce((s, i) => s + (i.onHand ?? 0), 0);

/** Tồn của 1 hàng: hàng có biến thể = tổng tồn các biến thể. */
export function stockOf(p: Pick<IProductListItem, 'hasVariants' | 'inventories' | 'childProducts'>): number {
  if (p.hasVariants && p.childProducts?.length) return p.childProducts.reduce((s, c) => s + sumOnHand(c.inventories), 0);
  return sumOnHand(p.inventories);
}

export const childStock = (c: IProductChild) => sumOnHand(c.inventories);

/** Giá vốn bình quân theo các chi nhánh có số liệu. */
export function avgCost(inv?: IProductInventory[] | null): number | null {
  const costs = (inv ?? []).map((i) => i.cost).filter((c): c is number => typeof c === 'number' && c > 0);
  return costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null;
}

/** Giá hiển thị: hàng có biến thể → khoảng giá các biến thể. */
export function priceLabel(p: IProductListItem): string {
  const prices = p.hasVariants ? (p.childProducts ?? []).map((c) => c.basePrice) : [];
  if (prices.length > 1) {
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    if (lo !== hi) return `${money(lo)} – ${money(hi)}`;
  }
  return money(prices[0] ?? p.basePrice);
}

function stockBadge(stock: number, min: number, productType: number) {
  if (productType === 3) return <Badge tone="info">{t('erp.service')}</Badge>;
  if (productType === 1) return <Badge tone="secondary">{t('erp.combo')}</Badge>;
  if (stock <= 0) return <Badge tone="error">{t('erp.outOfStock')}</Badge>;
  if (min > 0 && stock <= min) return <Badge tone="warning">{`${t('erp.lowStock')} · ${stock}`}</Badge>;
  return <Badge tone="neutral">{t('erp.stock', { n: fmtQty(stock) })}</Badge>;
}

/**
 * Nhãn tồn kho. `alignEnd` khi nằm trong cột canh phải (dưới giá): Badge có sẵn `self-start` nên tự canh
 * trái theo dòng giá rộng nhất ("90.000đ – 200.000đ") — bọc hàng ngang canh phải để cột tồn thẳng hàng.
 */
export function StockBadge({ stock, min = 0, productType = 2, alignEnd }: { stock: number; min?: number; productType?: number; alignEnd?: boolean }) {
  const badge = stockBadge(stock, min, productType);
  return alignEnd ? <View className="flex-row justify-end">{badge}</View> : badge;
}

export const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

/** Ảnh hàng (hoặc ô chữ cái đầu). */
export function ProductThumb({ uri, name, size = 44 }: { uri?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = uri && !failed ? (uri.startsWith('http') ? uri : getStorageUrl(uri)) : null;
  return (
    <View style={{ width: size, height: size, borderRadius: 12 }} className="bg-primary-soft items-center justify-center overflow-hidden">
      {src ? (
        <Image source={{ uri: src }} onError={() => setFailed(true)} style={{ width: size, height: size }} />
      ) : (
        <Text tone="primary" className="font-bold" style={{ fontSize: Math.round(size * 0.36) }}>
          {(name.trim()[0] ?? '?').toUpperCase()}
        </Text>
      )}
    </View>
  );
}

/** Ô tìm kiếm + nút quét mã vạch. */
export function SearchBar({
  value,
  onChange,
  placeholder,
  onScan,
  loading,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onScan?: () => void;
  loading?: boolean;
}) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1 flex-row items-center h-11 px-3 gap-2 rounded-2xl bg-surface dark:bg-surface-dark border border-line/70 dark:border-line-dark">
        <Icon name="magnify" size={20} tone="muted" />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={dark ? grey[500] : grey[500]}
          style={{ flex: 1, fontSize: 15, color: dark ? '#FFFFFF' : brand.ink, paddingVertical: 0 }}
          returnKeyType="search"
          autoCorrect={false}
        />
        {loading ? <Spinner size="small" /> : null}
        {value ? (
          <Pressable onPress={() => onChange('')} hitSlop={8}>
            <Icon name="close-circle" size={18} tone="faint" />
          </Pressable>
        ) : null}
      </View>
      {onScan ? (
        <Pressable onPress={onScan} accessibilityLabel={t('erp.scan')} className="w-11 h-11 rounded-2xl bg-primary items-center justify-center">
          <Icon name="barcode-scan" size={22} color="#FFFFFF" />
        </Pressable>
      ) : null}
    </View>
  );
}

export function isCancelledStatus(status?: string | null): boolean {
  return /hủy|huỷ|cancel/i.test(status ?? '') || status === '2';
}

/**
 * Nhãn đồng bộ KiotViet cho đơn tạo trên app/web. Không hiện với đơn đồng bộ từ KiotViet về, đơn chỉ lưu
 * trong hệ thống (NotPushed) và trạng thái lạ — xem syncBadge.
 */
export function SyncBadge({ status }: { status?: string | null }) {
  const badge = syncBadge(status);
  return badge ? <Badge tone={badge.tone} icon={badge.icon}>{t(badge.labelKey)}</Badge> : null;
}

export function ListFooter({ loading }: { loading: boolean }) {
  return loading ? (
    <View className="py-4 items-center">
      <Spinner />
    </View>
  ) : (
    <View style={{ height: 8 }} />
  );
}

/** Hàng label/giá trị trong thẻ chi tiết. */
export function InfoRow({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: 'primary' | 'error' | 'success' }) {
  return (
    <View className="flex-row items-center justify-between py-1.5 gap-3">
      <Text variant="bodySmall" tone="muted">{label}</Text>
      <Text
        variant={strong ? 'headline' : 'bodySmall'}
        tone={tone ?? 'default'}
        className={cn('flex-shrink text-right', strong ? 'font-bold' : 'font-medium')}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}
