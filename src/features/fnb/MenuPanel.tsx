import { useMemo, useState } from 'react';
import { View, ScrollView, TextInput } from 'react-native';

import { Text, Icon, Pressable, Chip, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { grey } from 'src/theme';
import { t } from 'src/i18n';
import type { IFnbMenu, IMenuDish } from 'src/types/fnb';

import { money } from 'src/features/erp/shared';
import { filterDishes, sortedCategories } from './menu';
import { GRID_GAP, gridColumns, tileWidth } from './fnb-layout';

// ----------------------------------------------------------------------
// Thực đơn: hàng chip nhóm món, ô tìm (không dấu), lưới món tự chia cột theo bề rộng khung. Bấm món = thêm /
// mở bảng tuỳ chọn; giữ lâu = luôn mở bảng tuỳ chọn (để ghi chú). Món hết mờ đi, không bấm được.
// ----------------------------------------------------------------------

export function MenuPanel({
  menu,
  loading,
  error,
  header,
  countOf,
  onPick,
  onOptions,
  onOpenItem,
  bottomInset,
}: {
  menu: IFnbMenu | undefined;
  loading: boolean;
  error: boolean;
  header?: React.ReactNode;
  /** Số phần của món đang chọn (hiện huy hiệu trên ô). */
  countOf: (dishId: string) => number;
  onPick: (dish: IMenuDish) => void;
  onOptions: (dish: IMenuDish) => void;
  onOpenItem: () => void;
  bottomInset: number;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [width, setWidth] = useState(0);

  const categories = useMemo(() => sortedCategories(menu).filter((c) => !c.parentId), [menu]);
  const dishes = useMemo(() => filterDishes(menu, { categoryId, keyword }), [menu, categoryId, keyword]);
  const cols = gridColumns(width, 150, 2);
  const tile = tileWidth(width, cols);

  return (
    <View className="flex-1">
      <View className="px-4 gap-2.5">
        {header}
        <View className="flex-row gap-2">
          <View className="flex-1 flex-row items-center h-11 px-3 gap-2 rounded-2xl border border-line dark:border-line-dark">
            <Icon name="magnify" size={20} tone="muted" />
            <TextInput
              value={keyword}
              onChangeText={setKeyword}
              placeholder={t('fnb.search')}
              placeholderTextColor={grey[500]}
              className="flex-1 text-ink dark:text-ink-dark text-[15px]"
              returnKeyType="search"
            />
            {keyword ? (
              <Pressable onPress={() => setKeyword('')} hitSlop={8}>
                <Icon name="close-circle" size={18} tone="faint" />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={onOpenItem} className="h-11 px-3 flex-row items-center gap-1.5 rounded-2xl bg-primary-soft">
            <Icon name="pencil-plus-outline" size={18} tone="primary" />
            <Text variant="bodySmall" tone="primary" className="font-semibold">{t('fnb.openItem')}</Text>
          </Pressable>
        </View>
        {categories.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 pr-4">
            <Chip label={t('fnb.all')} selected={!categoryId} color="primary" onPress={() => setCategoryId(null)} />
            {categories.map((c) => (
              <Chip key={c.id} label={c.name} selected={categoryId === c.id} color="primary" onPress={() => setCategoryId(c.id)} />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: bottomInset }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} className="flex-row flex-wrap" style={{ gap: GRID_GAP }}>
          {loading && !menu ? (
            <View className="w-full py-10"><Spinner /></View>
          ) : error && !menu ? (
            <Text variant="bodySmall" tone="error" className="w-full text-center py-10">{t('fnb.menuFailed')}</Text>
          ) : dishes.length === 0 ? (
            <Text variant="bodySmall" tone="muted" className="w-full text-center py-10">{t('fnb.noDishes')}</Text>
          ) : (
            dishes.map((d) => {
              const n = countOf(d.id);
              return (
                <Pressable
                  key={d.id}
                  disabled={d.isSoldOut}
                  onPress={() => onPick(d)}
                  onLongPress={() => onOptions(d)}
                  accessibilityLabel={d.name}
                  style={{ width: tile || undefined }}
                  className={cn(
                    'min-h-[84px] rounded-2xl p-3 justify-between border',
                    n > 0 ? 'border-primary bg-primary-soft' : 'border-line dark:border-line-dark bg-surface dark:bg-surface-dark',
                    d.isSoldOut && 'opacity-40'
                  )}
                >
                  <Text variant="callout" className="font-semibold" numberOfLines={2}>{d.name}</Text>
                  <View className="flex-row items-center justify-between mt-1.5">
                    <Text variant="bodySmall" tone={d.isSoldOut ? 'error' : 'muted'} className="font-semibold">
                      {d.isSoldOut ? t('fnb.soldOut') : money(d.priceFrom)}
                    </Text>
                    {n > 0 ? (
                      <View className="min-w-6 h-6 px-1.5 rounded-full bg-primary items-center justify-center">
                        <Text variant="caption" tone="inverse" className="font-bold">{n}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}
