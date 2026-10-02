import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { SectionCard } from 'src/components/shared';
import { Text, Divider, Button, Spinner } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { retryStockAdjustment } from 'src/api/erp';
import { t } from 'src/i18n';
import type { IStockAdjustment } from 'src/types/erp';

import { fmtQty } from 'src/features/erp/shared';
import { kickStockAdjustmentPolling, stockAdjustmentsQuery } from './hooks';
import { StockAdjustStatusBadge } from './StockAdjustSheet';
import { reasonLabel, sortRecent, stockAdjustErrorMessage } from './stock-adjust';

// ----------------------------------------------------------------------
// Lịch sử chỉnh tồn (chủ cửa hàng + quản lý): mới nhất trước, trạng thái đẩy KiotViet; lần lỗi có "Thử lại"
// (chỉ chủ cửa hàng). Hàng thường: tải luôn, chỉ hiện khi đã có lần chỉnh. Hàng có biến thể: mỗi biến thể một
// danh sách → bấm "Xem" mới tải (không gọi hàng loạt mỗi lần mở chi tiết).
// ----------------------------------------------------------------------

const MAX_ROWS = 15;

export type HistoryTarget = { productId: string; label?: string };

type Row = IStockAdjustment & { productId: string; label?: string };

const quantityLabel = (a: IStockAdjustment) =>
  a.mode === 'Set'
    ? t('erp.stockAdj.setTo', { n: fmtQty(a.quantity) })
    : `${a.quantity >= 0 ? '+' : '−'}${fmtQty(Math.abs(a.quantity))}`;

export function StockAdjustmentHistory({ targets, canRetry, lazy }: { targets: HistoryTarget[]; canRetry: boolean; lazy: boolean }) {
  const qc = useQueryClient();
  const [opened, setOpened] = useState(!lazy);
  const results = useQueries({ queries: targets.map((x) => stockAdjustmentsQuery(qc, x.productId, opened)) });

  const retry = useMutation({
    mutationFn: (row: Row) => retryStockAdjustment(row.id),
    onSuccess: (_, row) => {
      haptics.light();
      toast.info(t('erp.stockAdj.retried'));
      kickStockAdjustmentPolling(qc, row.productId);
    },
    onError: (err) => toast.error(stockAdjustErrorMessage(err), t('erp.actionFailed')),
  });

  if (targets.length === 0) return null;

  if (!opened) {
    return (
      <SectionCard title={t('erp.stockAdj.history')} icon="history" bodyClassName="pt-0">
        <Button variant="soft" size="sm" icon="history" onPress={() => setOpened(true)}>{t('erp.stockAdj.showHistory')}</Button>
      </SectionCard>
    );
  }

  const loading = results.some((r) => r.isLoading);
  const rows = sortRecent(
    results.flatMap((r, i) => (r.data ?? []).map((a): Row => ({ ...a, productId: targets[i]!.productId, label: targets[i]!.label })))
  ).slice(0, MAX_ROWS);

  // Hàng thường (tải sẵn): chưa có lần chỉnh / máy chủ chưa hỗ trợ → không chiếm chỗ trên màn chi tiết.
  if (!lazy && rows.length === 0) return null;

  return (
    <SectionCard title={t('erp.stockAdj.history')} icon="history" bodyClassName="pt-0">
      {rows.length === 0 ? (
        loading ? (
          <View className="py-3 items-center"><Spinner /></View>
        ) : (
          <Text variant="bodySmall" tone="muted">
            {results.some((r) => r.isError) ? t('erp.actionFailed') : t('erp.stockAdj.noHistory')}
          </Text>
        )
      ) : (
        rows.map((a, i) => {
          const after = a.kvOnHandAfter ?? a.targetOnHand;
          return (
            <View key={a.id}>
              {i > 0 ? <Divider /> : null}
              <View className="py-2.5 gap-1">
                <View className="flex-row items-center gap-2">
                  <Text variant="bodySmall" className="flex-1 font-semibold" numberOfLines={1}>
                    {[a.label, a.branchName || '—', quantityLabel(a)].filter(Boolean).join('  ·  ')}
                  </Text>
                  <StockAdjustStatusBadge status={a.status} />
                </View>
                <Text variant="caption" tone="muted" numberOfLines={2}>
                  {[
                    a.localOnHandBefore != null && after != null ? `${fmtQty(a.localOnHandBefore)} → ${fmtQty(after)}` : null,
                    reasonLabel(a.reason),
                    a.createdByName,
                    dayjs(a.createdAt).format('DD/MM HH:mm'),
                  ]
                    .filter(Boolean)
                    .join('  ·  ')}
                </Text>
                {a.note ? <Text variant="caption" tone="muted" numberOfLines={3}>{a.note}</Text> : null}
                {a.status === 'Failed' ? (
                  <View className="flex-row items-center gap-2">
                    <Text variant="caption" tone="error" className="flex-1" numberOfLines={3}>{a.error || t('erp.stockAdj.failedHint')}</Text>
                    {canRetry ? (
                      <View style={{ width: 110 }}>
                        <Button
                          size="sm"
                          variant="soft"
                          icon="refresh"
                          loading={retry.isPending && retry.variables?.id === a.id}
                          onPress={() => retry.mutate(a)}
                        >
                          {t('common.retry')}
                        </Button>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </SectionCard>
  );
}
