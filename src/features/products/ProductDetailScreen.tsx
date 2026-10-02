import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Screen, AppHeader, SectionCard, ErrorView } from 'src/components/shared';
import { Text, Icon, Pressable, Divider, Skeleton, Button } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';
import { isManagerUser } from 'src/auth/roles';
import { t } from 'src/i18n';
import type { IProductChild } from 'src/types/erp';

import { InfoRow, ProductThumb, StockBadge, avgCost, childStock, fmtQty, money, stockOf } from 'src/features/erp/shared';
import { useCart, lineFromProduct, lineFromVariant } from 'src/features/pos/cart-store';
import { useProduct } from './hooks';

// ----------------------------------------------------------------------
// Chi tiết hàng: giá bán, tồn theo chi nhánh, biến thể; giá vốn chỉ chủ/quản lý thấy. "Bán món này"
// thêm vào giỏ rồi mở Bán hàng.
// ----------------------------------------------------------------------

function VariantRow({ child, onSell, seeCost }: { child: IProductChild; onSell: () => void; seeCost: boolean }) {
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
      <Pressable onPress={onSell} accessibilityLabel={t('erp.sellThis')} className="w-9 h-9 rounded-xl bg-primary-soft items-center justify-center">
        <Icon name="cart-plus" size={18} tone="primary" />
      </Pressable>
    </View>
  );
}

export function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthContext();
  const { data: p, isLoading, isError, refetch } = useProduct(id);
  const add = useCart((s) => s.add);
  const seeCost = isManagerUser(user);

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
              <VariantRow child={c} seeCost={seeCost} onSell={() => sell(lineFromVariant(p, c))} />
            </View>
          ))}
        </SectionCard>
      ) : null}

      {(p.inventories ?? []).length > 0 ? (
        <SectionCard title={t('erp.stockByBranch')} icon="warehouse" bodyClassName="pt-0">
          {(p.inventories ?? []).map((inv) => (
            <InfoRow
              key={inv.id}
              label={inv.branchName || '—'}
              value={`${fmtQty(inv.onHand ?? 0)}${inv.reserved ? `  (${t('erp.reserved', { n: fmtQty(inv.reserved) })})` : ''}`}
            />
          ))}
        </SectionCard>
      ) : null}

      {p.description ? (
        <SectionCard title={t('erp.note')} icon="text" bodyClassName="pt-0">
          <Text variant="bodySmall" tone="muted">{p.description}</Text>
        </SectionCard>
      ) : null}

      {!p.hasVariants && p.allowsSale ? (
        <Button icon="cart-plus" onPress={() => sell(lineFromProduct(p))}>{t('erp.sellThis')}</Button>
      ) : null}
    </Screen>
  );
}
