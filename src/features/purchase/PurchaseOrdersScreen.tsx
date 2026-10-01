import { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { AppHeader, EmptyState } from 'src/components/shared';
import { Text, Pressable, Skeleton, Chip, Icon } from 'src/components/ui';
import { brand, softShadow } from 'src/theme';
import { getPurchaseOrders } from 'src/api/erp';
import { t } from 'src/i18n';
import type { IPurchaseOrder } from 'src/types/erp';

import { ListFooter, money } from 'src/features/erp/shared';
import { PoStatusBadge, PO_FILTERS, isReceiving } from './shared';

// ----------------------------------------------------------------------
// Nhập hàng (chủ / quản lý): phiếu nhập theo trạng thái, tạo phiếu mới, xác nhận và nhận hàng vào kho —
// cùng nghiệp vụ với bản web (core-be PurchaseOrders).
// ----------------------------------------------------------------------

function PoRow({ po }: { po: IPurchaseOrder }) {
  const ordered = po.items.reduce((s, i) => s + i.quantity, 0);
  const received = po.items.reduce((s, i) => s + i.receivedQuantity, 0);
  return (
    <Pressable onPress={() => router.push(`/purchase-orders/${po.id}` as any)} className="px-4 py-3 gap-1">
      <View className="flex-row items-center gap-2">
        <Text variant="bodySmall" className="font-bold flex-1" numberOfLines={1}>
          {po.orderNumber}
          <Text variant="caption" tone="muted">{`  ·  ${dayjs(po.createdAt).format('DD/MM/YYYY')}`}</Text>
        </Text>
        <Text variant="bodySmall" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{money(po.totalAmount)}</Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
          {po.supplierName || '—'}  ·  {isReceiving(po.status) ? t('erp.receivedOf', { received, ordered }) : t('erp.cartItems', { n: ordered })}
        </Text>
        <PoStatusBadge status={po.status} />
      </View>
    </Pressable>
  );
}

export function PurchaseOrdersScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState('all');
  const status = PO_FILTERS.find((f) => f.key === filter)?.status;

  const list = useInfiniteQuery({
    queryKey: ['erp', 'purchase-orders', filter],
    queryFn: ({ pageParam }) => getPurchaseOrders({ status, pageNumber: pageParam, pageSize: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pageNumber < last.totalPages ? last.pageNumber + 1 : undefined),
    staleTime: 30_000,
  });
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 gap-3">
        <AppHeader back title={t('erp.purchaseTitle')} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {PO_FILTERS.map((f) => (
            <Chip key={f.key} label={t(f.label)} selected={filter === f.key} color="primary" onPress={() => setFilter(f.key)} />
          ))}
        </ScrollView>
      </View>

      {list.isLoading ? (
        <View className="px-4 pt-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={60} radius={14} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <PoRow po={item} />}
          ItemSeparatorComponent={() => <View className="h-px bg-line/60 dark:bg-line-dark ml-4" />}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: 110 + insets.bottom }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => list.refetch()} colors={[brand.primary]} tintColor={brand.primary} />}
          ListEmptyComponent={<EmptyState icon="truck-delivery-outline" title={t('erp.noPurchases')} />}
          ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        />
      )}

      <Pressable
        onPress={() => router.push('/purchase-orders/new' as any)}
        className="absolute right-4 flex-row items-center gap-2 px-5 h-14 rounded-full bg-primary"
        style={[{ bottom: 24 + insets.bottom }, softShadow]}
      >
        <Icon name="plus" size={22} color="#FFFFFF" />
        <Text tone="inverse" className="font-bold">{t('erp.newPurchase')}</Text>
      </Pressable>
    </View>
  );
}
