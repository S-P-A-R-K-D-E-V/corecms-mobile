import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, ErrorView, Sheet } from 'src/components/shared';
import { Text, Divider, Skeleton, Button, Pressable, Icon } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { getPurchaseOrder, confirmPurchaseOrder, receivePurchaseOrder } from 'src/api/erp';
import { t } from 'src/i18n';
import type { IPurchaseOrder } from 'src/types/erp';

import { InfoRow, money } from 'src/features/erp/shared';
import { PoStatusBadge } from './shared';

// ----------------------------------------------------------------------
// Chi tiết phiếu nhập: phiếu tạm → "Xác nhận đặt hàng"; đã đặt / nhận một phần → "Nhận hàng" (nhập số
// thực nhận từng dòng, mặc định nhận đủ phần còn lại) → core-be cộng tồn kho.
// ----------------------------------------------------------------------

function ReceiveSheet({ po, visible, onClose, onDone }: { po: IPurchaseOrder; visible: boolean; onClose: () => void; onDone: () => void }) {
  const remaining = (i: IPurchaseOrder['items'][number]) => Math.max(0, i.quantity - i.receivedQuantity);
  const [qty, setQty] = useState<Record<string, number>>(() => Object.fromEntries(po.items.map((i) => [i.id, remaining(i)])));

  const receive = useMutation({
    mutationFn: () =>
      receivePurchaseOrder(
        po.id,
        po.items.filter((i) => (qty[i.id] ?? 0) > 0).map((i) => ({ purchaseOrderItemId: i.id, receivedQuantity: qty[i.id] }))
      ),
    onSuccess: () => {
      haptics.success();
      toast.success(t('erp.receiveDone'));
      onDone();
    },
    onError: (err) => toast.error(extractApiError(err), t('erp.actionFailed')),
  });

  const any = po.items.some((i) => (qty[i.id] ?? 0) > 0);

  return (
    <Sheet
      visible={visible}
      title={t('erp.receiveTitle')}
      onClose={onClose}
      footer={
        <View className="flex-row gap-2">
          <View style={{ width: 120 }}>
            <Button variant="soft" onPress={() => setQty(Object.fromEntries(po.items.map((i) => [i.id, remaining(i)])))}>
              {t('erp.receiveAll')}
            </Button>
          </View>
          <View className="flex-1">
            <Button icon="package-down" loading={receive.isPending} disabled={!any} onPress={() => receive.mutate()}>
              {t('erp.receive')}
            </Button>
          </View>
        </View>
      }
    >
      {po.items.map((i, idx) => {
        const left = remaining(i);
        const v = qty[i.id] ?? 0;
        return (
          <View key={i.id}>
            {idx > 0 ? <Divider /> : null}
            <View className="flex-row items-center gap-3 py-2.5">
              <View className="flex-1">
                <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{i.productName}</Text>
                <Text variant="caption" tone="muted">
                  {t('erp.receivedOf', { received: i.receivedQuantity, ordered: i.quantity })}  ·  {t('erp.remaining', { n: left })}
                </Text>
              </View>
              <View className="flex-row items-center rounded-xl border border-line dark:border-line-dark">
                <Pressable disabled={v <= 0} onPress={() => setQty((s) => ({ ...s, [i.id]: Math.max(0, v - 1) }))} className="w-9 h-9 items-center justify-center">
                  <Icon name="minus" size={18} tone={v <= 0 ? 'faint' : 'default'} />
                </Pressable>
                <Text className="min-w-[30px] text-center font-bold">{v}</Text>
                <Pressable disabled={v >= left} onPress={() => setQty((s) => ({ ...s, [i.id]: Math.min(left, v + 1) }))} className="w-9 h-9 items-center justify-center">
                  <Icon name="plus" size={18} tone={v >= left ? 'faint' : 'primary'} />
                </Pressable>
              </View>
            </View>
          </View>
        );
      })}
    </Sheet>
  );
}

export function PurchaseOrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [receiving, setReceiving] = useState(false);
  const { data: po, isLoading, isError, refetch } = useQuery({
    queryKey: ['erp', 'purchase-order', id],
    queryFn: () => getPurchaseOrder(id!),
    enabled: !!id,
  });

  const refresh = () => {
    refetch();
    qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === 'erp' });
  };

  const confirmPo = useMutation({
    mutationFn: () => confirmPurchaseOrder(id!),
    onSuccess: () => {
      haptics.success();
      refresh();
    },
    onError: (err) => toast.error(extractApiError(err), t('erp.actionFailed')),
  });

  if (isLoading) {
    return (
      <Screen scroll tabBarInset={false}>
        <AppHeader back title={t('erp.purchaseTitle')} />
        <Skeleton width="100%" height={220} radius={20} />
      </Screen>
    );
  }
  if (isError || !po) {
    return (
      <Screen tabBarInset={false}>
        <AppHeader back title={t('erp.purchaseTitle')} />
        <ErrorView onRetry={refetch} />
      </Screen>
    );
  }

  const canReceive = po.status === 'Confirmed' || po.status === 'PartiallyReceived';

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader back title={po.orderNumber} subtitle={dayjs(po.createdAt).format('DD/MM/YYYY HH:mm')} />
      <View className="flex-row"><PoStatusBadge status={po.status} /></View>

      <SectionCard title={t('erp.items')} icon="package-variant-closed" count={po.items.length} bodyClassName="pt-0">
        {po.items.map((i, idx) => (
          <View key={i.id}>
            {idx > 0 ? <Divider /> : null}
            <View className="flex-row items-start gap-3 py-2.5">
              <View className="flex-1">
                <Text variant="bodySmall" className="font-semibold">{i.productName}</Text>
                <Text variant="caption" tone="muted">
                  {i.productCode}  ·  {i.quantity} × {money(i.unitPrice)}  ·  {t('erp.receivedOf', { received: i.receivedQuantity, ordered: i.quantity })}
                </Text>
              </View>
              <Text variant="bodySmall" className="font-bold">{money(i.totalPrice)}</Text>
            </View>
          </View>
        ))}
        <Divider className="my-1.5" />
        <InfoRow label={t('erp.subtotal')} value={money(po.subTotal)} />
        {po.discountAmount ? <InfoRow label={t('erp.discount')} value={`−${money(po.discountAmount)}`} /> : null}
        <InfoRow label={t('erp.total')} value={money(po.totalAmount)} strong tone="primary" />
      </SectionCard>

      <SectionCard title={t('erp.details')} icon="information-outline" bodyClassName="pt-0">
        <InfoRow label={t('erp.supplier')} value={po.supplierName || '—'} />
        <InfoRow label={t('erp.warehouse')} value={po.warehouseName || '—'} />
        {po.createdByName ? <InfoRow label={t('erp.createdBy')} value={po.createdByName} /> : null}
        {po.paidByShareholderName ? <InfoRow label={t('erp.paidBy')} value={po.paidByShareholderName} /> : null}
        {po.note ? <InfoRow label={t('erp.note')} value={po.note} /> : null}
      </SectionCard>

      {po.status === 'Draft' ? (
        <Button
          icon="check-circle-outline"
          loading={confirmPo.isPending}
          onPress={async () => {
            if (await confirm({ title: t('erp.confirmPo'), message: t('erp.confirmPoMsg', { code: po.orderNumber }) })) confirmPo.mutate();
          }}
        >
          {t('erp.confirmPo')}
        </Button>
      ) : null}
      {canReceive ? (
        <Button icon="package-down" onPress={() => setReceiving(true)}>{t('erp.receive')}</Button>
      ) : null}

      {canReceive ? (
        <ReceiveSheet
          key={po.items.map((i) => i.receivedQuantity).join(',')}
          po={po}
          visible={receiving}
          onClose={() => setReceiving(false)}
          onDone={() => {
            setReceiving(false);
            refresh();
          }}
        />
      ) : null}
    </Screen>
  );
}
