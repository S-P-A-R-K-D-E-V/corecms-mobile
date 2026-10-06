import { useMemo, useState } from 'react';
import { View, FlatList, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { EmptyState } from 'src/components/shared';
import { Text, Icon, Pressable, Skeleton, Chip } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { getCategories } from 'src/api/erp';
import { t } from 'src/i18n';
import type { IProductListItem } from 'src/types/erp';

import { SearchBar, ProductThumb, StockBadge, ListFooter, priceLabel, stockOf, useDebounced } from 'src/features/erp/shared';
import { useProductSearch } from 'src/features/products/hooks';
import { activeCategoryId, hasCategoryFilter, posCategories } from './category-filter';

// ----------------------------------------------------------------------
// Khung chọn hàng: tìm (tên / mã / mã vạch) + nút quét, hàng chip lọc theo nhóm hàng, danh sách hàng tải thêm khi
// cuộn. Không biết gì về bố cục: lấp đầy khung cha, màn chứa đưa phần đầu (`header`) và khoảng trống cuối danh
// sách (`bottomInset` — thanh tab / thanh giỏ nổi ở điện thoại).
// ----------------------------------------------------------------------

export function ProductPickRow({ item, inCart, onPress }: { item: IProductListItem; inCart: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-4 py-2.5">
      <ProductThumb uri={item.coverImageUrl} name={item.name} size={40} />
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{item.name}</Text>
        <View className="flex-row items-center gap-1.5 mt-0.5">
          <Text variant="caption" tone="muted" numberOfLines={1}>{item.code}</Text>
          <StockBadge stock={stockOf(item)} min={item.minQuantity} productType={item.productType} />
        </View>
      </View>
      <Text variant="bodySmall" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{priceLabel(item)}</Text>
      <View className={cn('w-9 h-9 rounded-xl items-center justify-center', inCart ? 'bg-primary' : 'bg-primary-soft')}>
        {inCart ? (
          <Text tone="inverse" className="font-bold text-[13px]">{inCart}</Text>
        ) : (
          <Icon name={item.hasVariants && (item.childProducts ?? []).filter((c) => c.isActive).length > 1 ? 'chevron-down' : 'plus'} size={20} tone="primary" />
        )}
      </View>
    </Pressable>
  );
}

export type ProductPickerProps = {
  /** Phần đầu khung do màn chứa đưa vào (tiêu đề, chip kho…) — nằm trên ô tìm kiếm. */
  header?: React.ReactNode;
  /** Số lượng của 1 hàng đang có trong giỏ (hiện trên nút thêm). */
  inCart: (item: IProductListItem) => number;
  onPick: (item: IProductListItem) => void;
  /** Có thì hiện nút quét mã vạch cạnh ô tìm kiếm. */
  onScan?: () => void;
  /** Khoảng trống cuối danh sách để dòng cuối không nằm dưới thanh nổi của màn chứa. */
  bottomInset?: number;
};

export function ProductPicker({ header, inCart, onPick, onScan, bottomInset = 0 }: ProductPickerProps) {
  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword);

  // Nhóm hàng không tải được (cửa hàng chưa có tính năng, mất mạng) → không hiện hàng chip, vẫn bán bình thường.
  const categoriesQ = useQuery({ queryKey: ['erp', 'categories'], queryFn: getCategories, staleTime: 10 * 60_000 });
  const categories = useMemo(() => posCategories(categoriesQ.data), [categoriesQ.data]);
  const [pickedCategory, setPickedCategory] = useState<string | null>(null);
  const categoryId = activeCategoryId(pickedCategory, categories);

  const query = useProductSearch(q, categoryId);
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  return (
    <View className="flex-1">
      <View className="px-4 pt-2 gap-3">
        {header}
        <SearchBar value={keyword} onChange={setKeyword} placeholder={t('erp.search')} onScan={onScan} loading={query.isFetching && !query.isFetchingNextPage && !!q} />
      </View>

      {hasCategoryFilter(categories) ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          // ScrollView ngang trong cột sẽ tự giãn hết chiều cao còn lại nếu không chặn.
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2, gap: 8 }}
        >
          <Chip label={t('erp.categoryAll')} selected={categoryId === null} color="primary" onPress={() => setPickedCategory(null)} />
          {categories.map((c) => (
            <Chip key={c.id} label={c.name} selected={c.id === categoryId} color="primary" onPress={() => setPickedCategory(c.id)} />
          ))}
        </ScrollView>
      ) : null}

      {query.isLoading ? (
        <View className="px-4 pt-4 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width="100%" height={54} radius={14} />
          ))}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => <ProductPickRow item={item} inCart={inCart(item)} onPress={() => onPick(item)} />}
          ItemSeparatorComponent={() => <View className="h-px bg-line/60 dark:bg-line-dark ml-[68px]" />}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: bottomInset }}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<EmptyState icon="package-variant" title={t('erp.noResults')} />}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
        />
      )}
    </View>
  );
}
