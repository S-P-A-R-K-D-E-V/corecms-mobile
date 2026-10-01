import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, ErrorView } from 'src/components/shared';
import { Text, Divider, Skeleton, Badge } from 'src/components/ui';
import { getSalesOrder } from 'src/api/erp';
import { t } from 'src/i18n';

import { InfoRow, SyncBadge, isCancelledStatus, money, fmtQty } from 'src/features/erp/shared';

// ----------------------------------------------------------------------
// Chi tiết hoá đơn: món, tiền, thanh toán, người bán / khách, trạng thái đẩy KiotViet (đơn bán trên app).
// Chỉ xem — huỷ hoá đơn hiện chỉ đổi trạng thái trong core, chưa huỷ bên KiotViet nên chưa mở trên app.
// ----------------------------------------------------------------------

const paymentLabel = (m: string) => {
  const key = `payment.${m}`;
  const label = t(key);
  return label === key ? m : label;
};

export function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: o, isLoading, isError, refetch } = useQuery({
    queryKey: ['erp', 'invoice', id],
    queryFn: () => getSalesOrder(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <Screen scroll tabBarInset={false}>
        <AppHeader back title={t('tabs.invoices')} />
        <Skeleton width="100%" height={220} radius={20} />
      </Screen>
    );
  }
  if (isError || !o) {
    return (
      <Screen tabBarInset={false}>
        <AppHeader back title={t('tabs.invoices')} />
        <ErrorView onRetry={refetch} />
      </Screen>
    );
  }

  const cancelled = isCancelledStatus(o.status);

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader back title={o.orderNumber} subtitle={dayjs(o.createdAt).format('dddd, DD/MM/YYYY HH:mm')} />

      <View className="flex-row flex-wrap gap-1.5">
        {cancelled ? <Badge tone="error">{t('erp.cancelled')}</Badge> : <Badge tone="success">{t('erp.completed')}</Badge>}
        <SyncBadge status={o.kiotVietSyncStatus} />
        {o.kiotVietOrderCode ? <Badge tone="neutral">{`KiotViet ${o.kiotVietOrderCode}`}</Badge> : null}
      </View>
      {o.kiotVietSyncStatus === 'Failed' && o.kiotVietSyncError ? (
        <Text variant="caption" tone="error">{o.kiotVietSyncError}</Text>
      ) : null}

      <SectionCard title={t('erp.items')} icon="cart-outline" count={o.items.length} bodyClassName="pt-0">
        {o.items.map((i, idx) => (
          <View key={i.id}>
            {idx > 0 ? <Divider /> : null}
            <View className="flex-row items-start gap-3 py-2.5">
              <View className="flex-1">
                <Text variant="bodySmall" className="font-semibold">{i.productName}</Text>
                <Text variant="caption" tone="muted">
                  {i.productSKU ? `${i.productSKU}  ·  ` : ''}
                  {fmtQty(i.quantity)} × {money(i.unitPrice)}
                  {i.discountAmount ? `  −${money(i.discountAmount)}` : ''}
                </Text>
              </View>
              <Text variant="bodySmall" className="font-bold">{money(i.totalPrice)}</Text>
            </View>
          </View>
        ))}
        <Divider className="my-1.5" />
        <InfoRow label={t('erp.subtotal')} value={money(o.subTotal)} />
        {o.discountAmount ? <InfoRow label={t('erp.discount')} value={`−${money(o.discountAmount)}`} /> : null}
        <InfoRow label={t('erp.total')} value={money(o.totalAmount)} strong tone="primary" />
        <InfoRow label={t('erp.paid')} value={money(o.paidAmount)} />
      </SectionCard>

      {o.payments.length > 0 ? (
        <SectionCard title={t('erp.payments')} icon="cash-multiple" bodyClassName="pt-0">
          {o.payments.map((p) => (
            <InfoRow key={p.id} label={`${paymentLabel(p.method)}${p.transactionRef ? `  ·  ${p.transactionRef}` : ''}`} value={money(p.amount)} />
          ))}
        </SectionCard>
      ) : null}

      <SectionCard title={t('erp.details')} icon="information-outline" bodyClassName="pt-0">
        <InfoRow label={t('erp.customer')} value={o.customerName || t('erp.walkIn')} />
        {o.createdByName ? <InfoRow label={t('erp.seller')} value={o.createdByName} /> : null}
        {o.warehouseName ? <InfoRow label={t('erp.branch')} value={o.warehouseName} /> : null}
        {o.note ? <InfoRow label={t('erp.note')} value={o.note} /> : null}
      </SectionCard>
    </Screen>
  );
}
