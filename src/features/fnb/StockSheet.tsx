import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { getFnbLots, getFnbStock } from 'src/api/fnb';
import { Sheet } from 'src/components/shared';
import { Chip, Spinner, Text, TextField } from 'src/components/ui';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';

import { fDay, fQty } from './batch';
import { expiryCounts, lotState, lotTone, sortedIngredients, sortedLots, stockTone } from './stock-view';

// ----------------------------------------------------------------------
// Xem tồn nguyên liệu và hạn dùng theo lô của chi nhánh (chỉ đọc, cần mạng). Nhân viên không thấy giá vốn (máy chủ không
// trả). Xuất huỷ lô quá hạn làm ở "Việc kho → Xuất huỷ" hoặc trang web Hạn dùng.
// ----------------------------------------------------------------------

export function StockSheet({ visible, onClose, branchId }: { visible: boolean; onClose: () => void; branchId: string }) {
  const [tab, setTab] = useState<'stock' | 'expiry'>('stock');
  const [keyword, setKeyword] = useState('');

  const stockQ = useQuery({ queryKey: ['fnb', 'stock', branchId], queryFn: () => getFnbStock(branchId), enabled: visible && !!branchId });
  const lotsQ = useQuery({ queryKey: ['fnb', 'lots', branchId], queryFn: () => getFnbLots(branchId), enabled: visible && !!branchId });

  const ingredients = useMemo(() => sortedIngredients(stockQ.data?.ingredients ?? [], keyword), [stockQ.data, keyword]);
  const expiringDays = lotsQ.data?.expiringDays ?? 3;
  const lots = useMemo(() => sortedLots(lotsQ.data?.lots ?? []), [lotsQ.data]);
  const counts = expiryCounts(lotsQ.data?.lots ?? [], expiringDays);

  const active = tab === 'stock' ? stockQ : lotsQ;

  return (
    <Sheet visible={visible} title={t('fnbStock.stockTitle')} onClose={onClose}>
      <View className="gap-3">
        <View className="flex-row gap-2">
          <Chip label={t('fnbStock.stockTab')} selected={tab === 'stock'} color="primary" onPress={() => setTab('stock')} />
          <Chip
            label={
              counts.expired + counts.expiring > 0
                ? t('fnbStock.expiryTabCount', { n: counts.expired + counts.expiring })
                : t('fnbStock.expiryTab')
            }
            selected={tab === 'expiry'}
            color={counts.expired > 0 ? 'error' : 'primary'}
            onPress={() => setTab('expiry')}
          />
        </View>

        {active.isLoading ? (
          <View className="py-8 items-center"><Spinner /></View>
        ) : active.isError ? (
          <Text variant="bodySmall" tone="error" className="py-6 text-center">{extractApiError(active.error)}</Text>
        ) : tab === 'stock' ? (
          <View className="gap-1">
            <TextField placeholder={t('fnbStock.countSearch')} value={keyword} onChangeText={setKeyword} maxLength={50} />
            {ingredients.map((i) => (
              <View key={i.id} className="flex-row items-center gap-2 py-2 border-b border-line dark:border-line-dark">
                <Text variant="bodySmall" className="flex-1 font-semibold">{i.name}</Text>
                <View className="items-end">
                  <Text variant="bodySmall" style={{ fontVariant: ['tabular-nums'] }}>{fQty(i.onHand)} {i.unit ?? ''}</Text>
                  {i.status === 'out' || i.status === 'low' ? (
                    <Text variant="caption" tone={stockTone(i.status)}>
                      {i.status === 'out' ? t('fnbStock.stockOut') : t('fnbStock.stockLow', { days: i.daysLeft ?? 0 })}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {ingredients.length === 0 ? <Text variant="bodySmall" tone="muted" className="py-4 text-center">{t('fnbStock.countNoLines')}</Text> : null}
          </View>
        ) : (
          <View className="gap-1">
            {lots.map((l) => {
              const state = lotState(l, expiringDays);
              return (
                <View key={l.id} className="flex-row items-center gap-2 py-2 border-b border-line dark:border-line-dark">
                  <View className="flex-1">
                    <Text variant="bodySmall" className="font-semibold">{l.productName}</Text>
                    {l.label ? <Text variant="caption" tone="muted">{l.label}</Text> : null}
                  </View>
                  <View className="items-end">
                    <Text variant="bodySmall" style={{ fontVariant: ['tabular-nums'] }}>{fQty(l.remaining)} {l.unit ?? ''}</Text>
                    <Text variant="caption" tone={lotTone(state)}>
                      {state === 'none'
                        ? t('fnbStock.lotNoExpiry')
                        : state === 'expired'
                          ? t('fnbStock.lotExpired', { date: fDay(l.expiryDate!) })
                          : t('fnbStock.lotExpires', { date: fDay(l.expiryDate!), days: l.daysLeft ?? 0 })}
                    </Text>
                  </View>
                </View>
              );
            })}
            {lots.length === 0 ? <Text variant="bodySmall" tone="muted" className="py-4 text-center">{t('fnbStock.lotEmpty')}</Text> : null}
          </View>
        )}
      </View>
    </Sheet>
  );
}
