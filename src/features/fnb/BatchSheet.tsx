import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createFnbBatch, getFnbBatchRecipes } from 'src/api/fnb';
import { Sheet } from 'src/components/shared';
import { Button, Chip, Spinner, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';

import { Stepper } from './DishSheets';
import { newId } from './fnb-ids';
import {
  MAX_BATCH_COUNT,
  MAX_SHELF_DAYS,
  addDays,
  batchRequest,
  brewable,
  fDay,
  fQty,
  isoDay,
  plannedYield,
  scaleLines,
  shortages,
} from './batch';

// ----------------------------------------------------------------------
// Pha mẻ bán thành phẩm trên app (cần mạng, gọi thẳng API): chọn bán thành phẩm đã có công thức mẻ, số mẻ, sản lượng
// thật, số ngày bảo quản → "Pha xong" trừ nguyên liệu và cộng bán thành phẩm thành một lô có hạn. Khai công thức mẻ,
// xem / huỷ phiếu pha ở trang web (Thiết lập F&B → Bán thành phẩm, Kho nguyên liệu → Pha mẻ).
// ----------------------------------------------------------------------

export const batchKeys = { recipes: (branchId: string) => ['fnb', 'batch-recipes', branchId] as const };

export function BatchSheet({ visible, onClose, branchId }: { visible: boolean; onClose: () => void; branchId: string }) {
  const qc = useQueryClient();
  const bookQ = useQuery({
    queryKey: batchKeys.recipes(branchId),
    queryFn: () => getFnbBatchRecipes(branchId),
    enabled: visible && !!branchId,
  });

  const items = useMemo(() => brewable(bookQ.data?.items ?? []), [bookQ.data]);
  const ingredients = useMemo(() => new Map((bookQ.data?.ingredients ?? []).map((i) => [i.id, i])), [bookQ.data]);
  const onHand = useMemo(() => new Map((bookQ.data?.ingredients ?? []).map((i) => [i.id, i.onHand])), [bookQ.data]);

  const [productId, setProductId] = useState<string | null>(null);
  const [count, setCount] = useState(1);
  const [actualYield, setActualYield] = useState('');
  const [shelfDays, setShelfDays] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  // Mã chống lập trùng của lần pha đang soạn: bấm lại sau lỗi mạng vẫn chỉ ra một phiếu.
  const [requestId, setRequestId] = useState(() => newId());

  const item = items.find((i) => i.productId === productId) ?? items[0] ?? null;

  // Đổi bán thành phẩm (hoặc mở lại bảng): về số mẻ 1, sản lượng và hạn theo công thức.
  useEffect(() => {
    if (!visible) return;
    setCount(1);
    setActualYield('');
    setShelfDays(item?.shelfLifeDays ?? null);
    setNote('');
    setRequestId(newId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, item?.productId]);

  const today = isoDay(new Date());
  const lines = item ? scaleLines(item.lines, count) : [];
  const missing = shortages(lines, onHand);
  const planned = item ? plannedYield(item, count) : null;
  const request = item ? batchRequest(item, { count, actualYield, shelfDays, today }) : null;

  async function submit() {
    if (!item || !request) return;
    setSaving(true);
    try {
      const batch = await createFnbBatch({ branchId, clientRequestId: requestId, ...request, note: note.trim() || null });
      toast.success(t('fnbStock.batchDone', { code: batch.code, quantity: fQty(batch.actualYield), unit: batch.unit ?? '' }));
      await qc.invalidateQueries({ queryKey: batchKeys.recipes(branchId) });
      onClose();
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={t('fnbStock.batchTitle')}
      onClose={onClose}
      footer={
        item ? (
          <View className="flex-row items-center gap-3">
            <Stepper value={count} min={1} max={MAX_BATCH_COUNT} onChange={setCount} />
            <View className="flex-1">
              <Button icon="check" disabled={!request || saving} loading={saving} onPress={() => void submit()}>
                {t('fnbStock.batchSubmit')}
              </Button>
            </View>
          </View>
        ) : undefined
      }
    >
      {bookQ.isLoading ? (
        <View className="py-8 items-center"><Spinner /></View>
      ) : bookQ.isError ? (
        <Text variant="bodySmall" tone="error" className="py-6 text-center">{extractApiError(bookQ.error)}</Text>
      ) : !item ? (
        <Text variant="bodySmall" tone="muted" className="py-6 text-center">{t('fnbStock.batchEmpty')}</Text>
      ) : (
        <View className="gap-4">
          {items.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {items.map((i) => (
                <Chip key={i.productId} label={i.name} selected={i.productId === item.productId} color="primary" onPress={() => setProductId(i.productId)} />
              ))}
            </ScrollView>
          ) : (
            <Text variant="body" className="font-bold">{item.name}</Text>
          )}

          <Text variant="caption" tone="muted">
            {t('fnbStock.batchOnHand', { quantity: fQty(item.onHand), unit: item.unit ?? '' })}
            {item.note ? ` · ${item.note}` : ''}
          </Text>

          <View className="gap-1">
            <Text variant="label" tone="muted">{t('fnbStock.batchIngredients', { n: count })}</Text>
            {lines.map((l) => {
              const ingredient = ingredients.get(l.ingredientId);
              const short = missing.find((m) => m.ingredientId === l.ingredientId);
              return (
                <View key={l.ingredientId} className="flex-row items-center justify-between py-1">
                  <Text variant="bodySmall" className="flex-1 font-semibold">{ingredient?.name ?? '—'}</Text>
                  <View className="items-end">
                    <Text variant="bodySmall" style={{ fontVariant: ['tabular-nums'] }}>
                      {fQty(l.quantity)} {ingredient?.unit ?? ''}
                    </Text>
                    {short ? (
                      <Text variant="caption" tone="error">
                        {t('fnbStock.batchShort', { quantity: fQty(short.missing), unit: ingredient?.unit ?? '' })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>

          <TextField
            label={t('fnbStock.batchYield', { unit: item.unit ?? '' })}
            placeholder={planned != null ? fQty(planned) : undefined}
            value={actualYield}
            onChangeText={setActualYield}
            keyboardType="decimal-pad"
            maxLength={12}
          />

          {shelfDays != null ? (
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Text variant="label" tone="muted">{t('fnbStock.batchShelf')}</Text>
                <Text variant="bodySmall">
                  {shelfDays === 0 ? t('fnbStock.batchToday') : t('fnbStock.batchExpiry', { date: fDay(addDays(today, shelfDays)) })}
                </Text>
              </View>
              <Stepper value={shelfDays} min={0} max={MAX_SHELF_DAYS} onChange={setShelfDays} />
            </View>
          ) : null}

          <TextField label={t('fnbStock.note')} value={note} onChangeText={setNote} maxLength={500} />
          <Text variant="caption" tone="muted">{t('fnbStock.batchHint')}</Text>
        </View>
      )}
    </Sheet>
  );
}
