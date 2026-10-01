import { useMemo, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { AppHeader, EmptyState } from 'src/components/shared';
import { Text, Pressable, Skeleton, SegmentedControl, Badge } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { useAuthContext } from 'src/auth/auth-context';
import { usesAdminShell } from 'src/auth/roles';
import { getSalesOrders } from 'src/api/erp';
import { getRevenueReport } from 'src/api/reports';
import { t } from 'src/i18n';
import type { ISalesOrder } from 'src/types/erp';

import { SearchBar, ListFooter, SyncBadge, isCancelledStatus, money, useDebounced } from 'src/features/erp/shared';

// ----------------------------------------------------------------------
// Hoá đơn (chủ / quản lý): theo ngày (giờ VN), tìm mã hoá đơn / khách, tổng doanh thu + số hoá đơn của
// kỳ; bấm vào xem chi tiết. Hoá đơn CiCi đồng bộ từ KiotViet + đơn bán trên app/web.
// ----------------------------------------------------------------------

type Range = 'today' | 'yesterday' | 'last7' | 'last30';
const PAGE = 20;
const TAB_CLEARANCE = 110;

function rangeDates(r: Range) {
  const d = dayjs();
  const f = (x: dayjs.Dayjs) => x.format('YYYY-MM-DD');
  switch (r) {
    case 'yesterday':
      return { fromDate: f(d.subtract(1, 'day')), toDate: f(d.subtract(1, 'day')) };
    case 'last7':
      return { fromDate: f(d.subtract(6, 'day')), toDate: f(d) };
    case 'last30':
      return { fromDate: f(d.subtract(29, 'day')), toDate: f(d) };
    default:
      return { fromDate: f(d), toDate: f(d) };
  }
}

function InvoiceRow({ o }: { o: ISalesOrder }) {
  const cancelled = isCancelledStatus(o.status);
  const itemsText = o.items.map((i) => (i.quantity === 1 ? i.productName : `${i.productName} ×${i.quantity}`)).join(', ');
  return (
    <Pressable onPress={() => router.push(`/invoices/${o.id}` as any)} className={cn('px-4 py-3 gap-1', cancelled && 'opacity-55')}>
      <View className="flex-row items-center gap-2">
        <Text variant="bodySmall" className="font-bold flex-1" numberOfLines={1}>
          {o.orderNumber}
          <Text variant="caption" tone="muted">{`  ·  ${dayjs(o.createdAt).format('DD/MM HH:mm')}`}</Text>
        </Text>
        <Text variant="bodySmall" className={cn('font-bold', cancelled && 'line-through')} style={{ fontVariant: ['tabular-nums'] }}>
          {money(o.totalAmount)}
        </Text>
      </View>
      {itemsText ? (
        <Text variant="caption" numberOfLines={1}>{itemsText}</Text>
      ) : null}
      <View className="flex-row items-center gap-1.5 flex-wrap">
        <Text variant="caption" tone="muted" numberOfLines={1} className="flex-shrink">
          {o.customerName || t('erp.walkIn')}
          {o.createdByName ? `  ·  ${o.createdByName}` : ''}
        </Text>
        {cancelled ? <Badge tone="error">{t('erp.cancelled')}</Badge> : null}
        {!cancelled && o.paymentStatus !== 'Paid' && o.totalAmount > 0 ? <Badge tone="warning">{t('erp.unpaid')}</Badge> : null}
        <SyncBadge status={o.kiotVietSyncStatus} />
      </View>
    </Pressable>
  );
}

export function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const [range, setRange] = useState<Range>('today');
  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword);
  const dates = rangeDates(range);

  const list = useInfiniteQuery({
    queryKey: ['erp', 'invoices', range, q, dates.fromDate],
    queryFn: ({ pageParam }) => getSalesOrders({ ...dates, keyword: q, pageNumber: pageParam, pageSize: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pageNumber < last.totalPages ? last.pageNumber + 1 : undefined),
    staleTime: 30_000,
  });
  const summary = useQuery({
    queryKey: ['erp', 'invoice-summary', dates.fromDate, dates.toDate],
    queryFn: () => getRevenueReport({ ...dates, groupBy: 'day' }),
    staleTime: 30_000,
  });

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const total = list.data?.pages[0]?.totalCount ?? 0;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 gap-3">
        <AppHeader back={!usesAdminShell(user)} title={t('tabs.invoices')} />
        <SegmentedControl
          segments={(['today', 'yesterday', 'last7', 'last30'] as Range[]).map((k) => ({ key: k, label: t(`erp.${k}`) }))}
          value={range}
          onChange={(k) => setRange(k as Range)}
        />
        <View className="flex-row gap-3">
          <View className="flex-1 rounded-2xl bg-primary-soft px-4 py-3">
            <Text variant="caption" tone="primary">{t('erp.revenue')}</Text>
            <Text variant="headline" tone="primary" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>
              {summary.data ? money(summary.data.totalRevenue) : '—'}
            </Text>
          </View>
          <View className="flex-1 rounded-2xl bg-ink/5 dark:bg-white/10 px-4 py-3">
            <Text variant="caption" tone="muted">{t('erp.invoiceCountLabel')}</Text>
            <Text variant="headline" className="font-bold">{list.data ? total : '—'}</Text>
          </View>
        </View>
        <SearchBar value={keyword} onChange={setKeyword} placeholder={t('erp.invoiceSearch')} loading={list.isFetching && !list.isFetchingNextPage && !!q} />
      </View>

      {list.isLoading ? (
        <View className="px-4 pt-4 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height={66} radius={14} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => <InvoiceRow o={item} />}
          ItemSeparatorComponent={() => <View className="h-px bg-line/60 dark:bg-line-dark ml-4" />}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: TAB_CLEARANCE + insets.bottom }}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && list.fetchNextPage()}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching && !list.isFetchingNextPage}
              onRefresh={() => {
                list.refetch();
                summary.refetch();
              }}
              colors={[brand.primary]}
              tintColor={brand.primary}
            />
          }
          ListEmptyComponent={<EmptyState icon="receipt" title={t('erp.noInvoices')} />}
          ListFooterComponent={<ListFooter loading={list.isFetchingNextPage} />}
        />
      )}
    </View>
  );
}
