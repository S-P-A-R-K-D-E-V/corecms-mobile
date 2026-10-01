import { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, EmptyState, BarcodeScannerModal } from 'src/components/shared';
import { Text, Pressable, Skeleton } from 'src/components/ui';
import { brand } from 'src/theme';
import { useAuthContext } from 'src/auth/auth-context';
import { isManagerUser, usesAdminShell } from 'src/auth/roles';
import { t } from 'src/i18n';
import type { IProductListItem } from 'src/types/erp';

import { SearchBar, StockBadge, ProductThumb, ListFooter, priceLabel, stockOf, useDebounced } from 'src/features/erp/shared';
import { useProductSearch } from './hooks';

// ----------------------------------------------------------------------
// Hàng hoá: tra cứu giá + tồn ngay trên điện thoại (tìm theo tên/mã/mã vạch hoặc quét). Chủ cửa hàng:
// tab trên thanh; nhân viên mở từ Tiện ích. Chỉ xem — giá/tồn của CiCi đồng bộ từ KiotViet.
// ----------------------------------------------------------------------

const TAB_CLEARANCE = 110;

function ProductRow({ item }: { item: IProductListItem }) {
  const stock = stockOf(item);
  return (
    <Pressable onPress={() => router.push(`/products/${item.id}` as any)} className="flex-row items-center gap-3 px-4 py-3">
      <ProductThumb uri={item.coverImageUrl} name={item.name} />
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{item.name}</Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {item.code}
          {item.hasVariants && item.childProducts?.length ? `  ·  ${t('erp.variants', { n: item.childProducts.length })}` : ''}
          {item.categoryName ? `  ·  ${item.categoryName}` : ''}
        </Text>
      </View>
      <View className="items-end gap-1">
        <Text variant="bodySmall" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{priceLabel(item)}</Text>
        <StockBadge stock={stock} min={item.minQuantity} productType={item.productType} />
      </View>
    </Pressable>
  );
}

export function ProductsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const [keyword, setKeyword] = useState('');
  const [scanning, setScanning] = useState(false);
  const q = useDebounced(keyword);
  const query = useProductSearch(q);

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.totalCount ?? 0;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 gap-3">
        {/* Chủ cửa hàng: tab trên thanh; nhân viên mở từ Tiện ích → cần nút quay lại. */}
        <AppHeader
          back={!usesAdminShell(user)}
          title={t('tabs.products')}
          subtitle={query.data ? t('erp.productsCount', { n: total }) : undefined}
          actions={isManagerUser(user) ? [{ icon: 'truck-delivery-outline', onPress: () => router.push('/purchase-orders' as any) }] : undefined}
        />
        <SearchBar
          value={keyword}
          onChange={setKeyword}
          placeholder={t('erp.search')}
          onScan={() => setScanning(true)}
          loading={query.isFetching && !query.isFetchingNextPage && !!q}
        />
      </View>

      {query.isLoading ? (
        <View className="px-4 pt-4 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width="100%" height={60} radius={14} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <ProductRow item={item} />}
          ItemSeparatorComponent={() => <View className="h-px bg-line/60 dark:bg-line-dark ml-[72px]" />}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: TAB_CLEARANCE + insets.bottom }}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => query.refetch()} colors={[brand.primary]} tintColor={brand.primary} />}
          ListEmptyComponent={<EmptyState icon="package-variant" title={t('erp.noResults')} />}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
        />
      )}

      <BarcodeScannerModal visible={scanning} onClose={() => setScanning(false)} onScanned={(code) => setKeyword(code)} />
    </View>
  );
}

