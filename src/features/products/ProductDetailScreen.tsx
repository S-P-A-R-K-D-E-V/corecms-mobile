import { useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Screen, AppHeader, SectionCard, ErrorView } from 'src/components/shared';
import { Text, Icon, Pressable, Divider, Skeleton, Button } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';
import { isAdminUser, isManagerUser } from 'src/auth/roles';
import { t } from 'src/i18n';
import type { IProductChild, IProductInventory } from 'src/types/erp';

import { InfoRow, ProductThumb, StockBadge, avgCost, childStock, fmtQty, money, stockOf } from 'src/features/erp/shared';
import { useCart, lineFromProduct, lineFromVariant } from 'src/features/pos/cart-store';
import { useProduct } from './hooks';
import { StockAdjustSheet, adjustableInventories, type StockTarget } from './StockAdjustSheet';
import { StockAdjustmentHistory } from './StockAdjustmentHistory';

// ----------------------------------------------------------------------
// Chi tiết hàng: giá bán, tồn theo chi nhánh, biến thể; giá vốn chỉ chủ/quản lý thấy. "Bán món này"
// thêm vào giỏ rồi mở Bán hàng.
// Chủ cửa hàng: "Sửa tồn" từng chi nhánh (hàng thường) / từng biến thể — không cho combo, dịch vụ (không có
// tồn); hàng gộp biến thể sửa ở dòng biến thể. Chủ + quản lý xem lịch sử chỉnh tồn.
// ----------------------------------------------------------------------

/** Nút bút chì nhỏ cạnh dòng tồn. */
function EditStockButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={t('erp.stockAdj.edit')}
      className="w-9 h-9 rounded-xl bg-ink/5 dark:bg-white/10 items-center justify-center"
    >
      <Icon name="pencil-outline" size={18} tone="primary" />
    </Pressable>
  );
}

/** Dòng tồn 1 chi nhánh (+ "Sửa tồn" cho chủ cửa hàng). */
function BranchStockRow({ inv, onEdit }: { inv: IProductInventory; onEdit?: () => void }) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="flex-1">
        <InfoRow
          label={inv.branchName || '—'}
          value={`${fmtQty(inv.onHand ?? 0)}${inv.reserved ? `  (${t('erp.reserved', { n: fmtQty(inv.reserved) })})` : ''}`}
        />
      </View>
      {onEdit ? <EditStockButton onPress={onEdit} /> : null}
    </View>
  );
}

function VariantRow({
  child,
  onSell,
  seeCost,
  onEditStock,
}: {
  child: IProductChild;
  onSell: () => void;
  seeCost: boolean;
  onEditStock?: () => void;
}) {
  const stock = childStock(child);
  const cost = seeCost ? avgCost(child.inventories) : null;
  const attrs = (child.attributes ?? []).map((a) => a.attributeValue).join(' · ');
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>{attrs || child.name}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {child.code}{child.barCode ? `  ·  ${child.barCode}` : ''}
          {cost !== null ? `  ·  ${t('erp.cost')} ${money(Math.round(cost))}` : ''}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text variant="bodySmall" className="font-bold">{money(child.basePrice)}</Text>
        <StockBadge alignEnd stock={stock} />
      </View>
      {onEditStock ? <EditStockButton onPress={onEditStock} /> : null}
      <Pressable onPress={onSell} accessibilityLabel={t('erp.sellThis')} className="w-9 h-9 rounded-xl bg-primary-soft items-center justify-center">
        <Icon name="cart-plus" size={18} tone="primary" />
      </Pressable>
    </View>
  );
}

/** Tên biến thể: "Áo thun · Đỏ · M" (prefix rỗng → chỉ thuộc tính). */
function variantName(prefix: string, c: IProductChild): string {
  const attrs = (c.attributes ?? []).map((a) => a.attributeValue).join(' · ');
  if (!attrs) return c.name;
  return prefix ? `${prefix} · ${attrs}` : attrs;
}

export function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthContext();
  const { data: p, isLoading, isError, refetch } = useProduct(id);
  const add = useCart((s) => s.add);
  const isManager = isManagerUser(user);
  const seeCost = isManager;
  const isAdmin = isAdminUser(user);
  const [adjust, setAdjust] = useState<{ target: StockTarget; branchId?: number } | null>(null);

  function sell(line: Parameters<typeof add>[0]) {
    haptics.light();
    add(line);
    toast.success(t('erp.added', { name: line.name }));
    // Đóng màn chi tiết (stack) trước rồi mới đổi tab: làm cùng lúc trên Android để lại lớp chuyển cảnh
    // trắng che màn Bán hàng.
    if (router.canGoBack()) router.back();
    setTimeout(() => router.navigate('/(tabs)/pos' as any), 350);
  }

  if (isLoading) {
    return (
      <Screen scroll tabBarInset={false}>
        <AppHeader back title={t('tabs.products')} />
        <Skeleton width="100%" height={140} radius={20} />
        <Skeleton width="100%" height={200} radius={20} />
      </Screen>
    );
  }
  if (isError || !p) {
    return (
      <Screen tabBarInset={false}>
        <AppHeader back title={t('tabs.products')} />
        <ErrorView onRetry={refetch} />
      </Screen>
    );
  }

  const stock = stockOf(p);
  const cost = avgCost(p.inventories);
  const cover = p.images?.[0]?.imageUrl;
  const children = (p.childProducts ?? []).filter((c) => c.isActive);
  // Có biến thể = có biến thể đang bán. Cờ hasVariants đồng bộ từ KiotViet bật cả với hàng không còn biến thể
  // nào (CiCi: 205 hàng) → coi như hàng thường để còn bán / sửa tồn được.
  const hasVariants = children.length > 0;
  // Chỉ hàng có tồn (không phải combo / dịch vụ) mới sửa tồn; lịch sử chỉnh tồn: chủ + quản lý. Loại hàng đồng
  // bộ từ KiotViet có thể chưa có (0) — coi là hàng thường.
  const stocked = p.productType !== 1 && p.productType !== 3;
  const canAdjust = isAdmin && stocked;
  const editChild = (c: IProductChild) =>
    canAdjust && adjustableInventories(c.inventories).length > 0
      ? () => setAdjust({ target: { productId: c.id, name: variantName(p.name, c), inventories: c.inventories ?? [] } })
      : undefined;

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader back title={t('tabs.products')} />

      <View className="flex-row gap-4 items-center">
        <ProductThumb uri={cover} name={p.name} size={84} />
        <View className="flex-1 gap-1">
          <Text variant="title2" numberOfLines={3}>{p.name}</Text>
          <Text variant="bodySmall" tone="muted">{p.categoryName}</Text>
          <View className="flex-row"><StockBadge stock={stock} min={p.minQuantity} productType={p.productType} /></View>
        </View>
      </View>

      <SectionCard title={t('erp.price')} icon="tag-outline" bodyClassName="pt-0">
        <Text className="text-[28px] leading-[34px] font-bold" tone="primary">{money(p.basePrice)}</Text>
        {seeCost && cost !== null ? (
          <View className="mt-2 flex-row items-center gap-2">
            <Icon name="eye-outline" size={14} tone="muted" />
            <Text variant="caption" tone="muted">
              {t('erp.cost')}: <Text variant="caption" className="font-bold">{money(Math.round(cost))}</Text>  ·  {t('erp.costOwnerOnly')}
            </Text>
          </View>
        ) : null}
        <Divider className="my-2" />
        <InfoRow label={t('erp.code')} value={p.code} />
        {p.barCode ? <InfoRow label={t('erp.barcode')} value={p.barCode} /> : null}
        {p.unit ? <InfoRow label={t('erp.unit')} value={p.unit} /> : null}
        {p.tradeMarkName ? <InfoRow label={t('erp.brand')} value={p.tradeMarkName} /> : null}
      </SectionCard>

      {children.length > 0 ? (
        <SectionCard title={t('erp.variantList')} icon="shape-outline" count={children.length} bodyClassName="pt-0">
          {children.map((c, i) => (
            <View key={c.id}>
              {i > 0 ? <Divider /> : null}
              <VariantRow child={c} seeCost={seeCost} onSell={() => sell(lineFromVariant(p, c))} onEditStock={editChild(c)} />
            </View>
          ))}
        </SectionCard>
      ) : null}

      {(p.inventories ?? []).length > 0 ? (
        <SectionCard title={t('erp.stockByBranch')} icon="warehouse" bodyClassName="pt-0">
          {(p.inventories ?? []).map((inv) => (
            <BranchStockRow
              key={inv.id}
              inv={inv}
              onEdit={
                canAdjust && !hasVariants && typeof inv.branchId === 'number'
                  ? () => setAdjust({ target: { productId: p.id, name: p.name, inventories: p.inventories ?? [] }, branchId: inv.branchId! })
                  : undefined
              }
            />
          ))}
        </SectionCard>
      ) : null}

      {isManager && stocked ? (
        <StockAdjustmentHistory
          key={p.id}
          targets={hasVariants ? children.map((c) => ({ productId: c.id, label: variantName('', c) })) : [{ productId: p.id }]}
          canRetry={isAdmin}
          lazy={hasVariants}
        />
      ) : null}

      {p.description ? (
        <SectionCard title={t('erp.note')} icon="text" bodyClassName="pt-0">
          <Text variant="bodySmall" tone="muted">{p.description}</Text>
        </SectionCard>
      ) : null}

      {!hasVariants && p.allowsSale ? (
        <Button icon="cart-plus" onPress={() => sell(lineFromProduct(p))}>{t('erp.sellThis')}</Button>
      ) : null}

      {canAdjust ? <StockAdjustSheet target={adjust?.target ?? null} initialBranchId={adjust?.branchId} onClose={() => setAdjust(null)} /> : null}
    </Screen>
  );
}
