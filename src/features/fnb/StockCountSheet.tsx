import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { createFnbStockCount, getFnbStockCount, getFnbStockCounts, saveFnbStockCount, submitFnbStockCount } from 'src/api/fnb';
import { Sheet } from 'src/components/shared';
import { Button, Chip, Icon, Spinner, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { IFnbStockCount } from 'src/types/fnb';

import { hasInvalidEdit, isCounted, progress, shownQuantity, toEntries, visibleLines, type CountEdits } from './stock-count';

// ----------------------------------------------------------------------
// Kiểm kho nguyên liệu trên app (cần mạng, gọi thẳng API): mở phiếu nháp đang có của chi nhánh, hoặc lập phiếu mới
// (theo định lượng / tất cả). Nhập số đếm từng dòng theo đơn vị gốc hoặc đơn vị mua, "Lưu" để ghi lên máy chủ (người
// khác đếm tiếp được), "Nộp phiếu" để quản lý duyệt. Nhân viên đếm mù — không hiện số hệ thống. Duyệt chênh lệch ở web.
// ----------------------------------------------------------------------

const countKeys = { open: (branchId: string) => ['fnb', 'stock-count', 'open', branchId] as const };

export function StockCountSheet({ visible, onClose, branchId }: { visible: boolean; onClose: () => void; branchId: string }) {
  const qc = useQueryClient();
  // Phiếu nháp gần nhất của chi nhánh (kèm các dòng); chưa có thì null.
  const openQ = useQuery({
    queryKey: countKeys.open(branchId),
    queryFn: async (): Promise<IFnbStockCount | null> => {
      const drafts = await getFnbStockCounts(branchId, 'Draft');
      return drafts.length > 0 ? getFnbStockCount(drafts[0].id) : null;
    },
    enabled: visible && !!branchId,
  });

  const [count, setCount] = useState<IFnbStockCount | null>(null);
  const [edits, setEdits] = useState<CountEdits>({});
  const [keyword, setKeyword] = useState('');
  const [onlyUncounted, setOnlyUncounted] = useState(false);
  const [busy, setBusy] = useState<'create' | 'save' | 'submit' | null>(null);

  useEffect(() => {
    if (!visible) return;
    setCount(openQ.data ?? null);
    setEdits({});
    setKeyword('');
    setOnlyUncounted(false);
  }, [visible, openQ.data]);

  const lines = useMemo(
    () => (count ? visibleLines(count, edits, keyword, onlyUncounted) : []),
    [count, edits, keyword, onlyUncounted]
  );
  const done = count ? progress(count, edits) : { counted: 0, total: 0 };
  const invalid = hasInvalidEdit(edits);
  const dirty = Object.keys(edits).length > 0;

  async function create(scope: 'Recipe' | 'All') {
    setBusy('create');
    try {
      setCount(await createFnbStockCount({ branchId, scope }));
      setEdits({});
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(null);
    }
  }

  /** Ghi các số đang nhập lên máy chủ; trả phiếu mới nhất (null khi lỗi). */
  async function save(): Promise<IFnbStockCount | null> {
    if (!count) return null;
    const entries = toEntries(edits);
    if (entries.length === 0) return count;
    const saved = await saveFnbStockCount(count.id, entries);
    setCount(saved);
    setEdits({});
    return saved;
  }

  async function run(action: 'save' | 'submit') {
    if (!count || invalid) return;
    setBusy(action);
    try {
      const saved = await save();
      if (action === 'save') {
        toast.success(t('fnbStock.countSaved'));
      } else if (saved) {
        const submitted = await submitFnbStockCount(saved.id);
        toast.success(t('fnbStock.countSubmitted', { code: submitted.code }));
        await qc.invalidateQueries({ queryKey: countKeys.open(branchId) });
        onClose();
      }
    } catch (err) {
      toast.error(extractApiError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={count ? t('fnbStock.countTitleCode', { code: count.code }) : t('fnbStock.countTitle')}
      onClose={onClose}
      footer={
        count ? (
          <View className="flex-row items-center gap-3">
            <View className="flex-1">
              <Button variant="outline" icon="content-save-outline" disabled={!dirty || invalid || !!busy} loading={busy === 'save'} onPress={() => void run('save')}>
                {t('fnbStock.countSave')}
              </Button>
            </View>
            <View className="flex-1">
              <Button icon="check" disabled={invalid || !!busy || done.counted === 0} loading={busy === 'submit'} onPress={() => void run('submit')}>
                {t('fnbStock.countSubmit')}
              </Button>
            </View>
          </View>
        ) : undefined
      }
    >
      {openQ.isLoading ? (
        <View className="py-8 items-center"><Spinner /></View>
      ) : openQ.isError ? (
        <Text variant="bodySmall" tone="error" className="py-6 text-center">{extractApiError(openQ.error)}</Text>
      ) : !count ? (
        <View className="gap-3 py-2">
          <Text variant="bodySmall" tone="muted">{t('fnbStock.countStartHint')}</Text>
          <Button icon="clipboard-list-outline" disabled={!!busy} loading={busy === 'create'} onPress={() => void create('Recipe')}>
            {t('fnbStock.countStartRecipe')}
          </Button>
          <Button variant="outline" icon="format-list-bulleted" disabled={!!busy} onPress={() => void create('All')}>
            {t('fnbStock.countStartAll')}
          </Button>
        </View>
      ) : (
        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text variant="label" tone="muted">{t('fnbStock.countProgress', { counted: done.counted, total: done.total })}</Text>
            <Chip
              label={t('fnbStock.countOnlyUncounted')}
              selected={onlyUncounted}
              color="primary"
              onPress={() => setOnlyUncounted((v) => !v)}
            />
          </View>
          <TextField placeholder={t('fnbStock.countSearch')} value={keyword} onChangeText={setKeyword} maxLength={50} />

          {lines.map((line) => {
            const edit = edits[line.lineId];
            const unitId = edit?.unitId ?? null;
            const setEdit = (change: Partial<{ quantity: string; unitId: string | null }>) =>
              setEdits((prev) => ({
                ...prev,
                [line.lineId]: { quantity: shownQuantity(line, prev), unitId: prev[line.lineId]?.unitId ?? null, ...change },
              }));
            return (
              <View key={line.lineId} className="gap-2 py-2 border-b border-line dark:border-line-dark">
                <View className="flex-row items-center gap-2">
                  <Icon name={isCounted(line, edits) ? 'check-circle' : 'circle-outline'} size={18} tone={isCounted(line, edits) ? 'success' : 'faint'} />
                  <Text variant="bodySmall" className="flex-1 font-semibold">{line.productName}</Text>
                  {line.systemQuantity != null ? (
                    <Text variant="caption" tone="muted">{t('fnbStock.countSystem', { quantity: line.systemQuantity, unit: line.unit ?? '' })}</Text>
                  ) : null}
                </View>
                <View className="flex-row items-center gap-2">
                  <View className="w-28">
                    <TextField
                      placeholder={t('fnbStock.countQty')}
                      value={shownQuantity(line, edits)}
                      onChangeText={(v) => setEdit({ quantity: v })}
                      keyboardType="decimal-pad"
                      maxLength={12}
                    />
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
                    <Chip label={line.unit ?? '—'} selected={unitId == null} color="primary" onPress={() => setEdit({ unitId: null })} />
                    {(line.units ?? []).map((u) => (
                      <Chip key={u.unitId} label={u.name} selected={unitId === u.unitId} color="primary" onPress={() => setEdit({ unitId: u.unitId })} />
                    ))}
                  </ScrollView>
                </View>
              </View>
            );
          })}
          {lines.length === 0 ? <Text variant="bodySmall" tone="muted" className="py-4 text-center">{t('fnbStock.countNoLines')}</Text> : null}
          {invalid ? <Text variant="caption" tone="error">{t('fnbStock.countInvalid')}</Text> : null}
          <Text variant="caption" tone="muted">{t('fnbStock.countHint')}</Text>
        </View>
      )}
    </Sheet>
  );
}
