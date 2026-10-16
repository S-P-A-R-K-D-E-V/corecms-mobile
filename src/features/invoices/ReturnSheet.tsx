import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Sheet } from 'src/components/shared';
import { Button, Chip, Divider, Text, TextField } from 'src/components/ui';
import { confirm, toast } from 'src/components/overlay';
import { completeSalesReturn, createSalesReturn, getWarehouses } from 'src/api/erp';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';
import type { ISalesOrder } from 'src/types/erp';

import { Stepper } from 'src/features/fnb/DishSheets';
import { money, fmtQty } from 'src/features/erp/shared';

// ----------------------------------------------------------------------
// Trả hàng từ hoá đơn (máy quầy + quản lý): chọn số lượng trả của từng dòng, kho nhận lại hàng → tạo phiếu trả rồi
// hoàn tất luôn (nhập lại kho, ghi tiền hoàn). Ở máy quầy server tự đặt giá theo hoá đơn và chặn trả quá phần đã bán
// (core-be CreateSalesReturn StrictToInvoice) — số tiền hiện ở đây chỉ là ước tính theo giá thực thu của dòng.
// ----------------------------------------------------------------------

type Props = { order: ISalesOrder; visible: boolean; onClose: () => void };

/** Giá thực thu một đơn vị của dòng (sau giảm giá dòng). */
function unitNet(item: ISalesOrder['items'][number]): number {
  return item.quantity > 0 ? Math.floor(item.totalPrice / item.quantity) : 0;
}

export function ReturnSheet({ order, visible, onClose }: Props) {
  const queryClient = useQueryClient();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const warehousesQ = useQuery({ queryKey: ['erp', 'warehouses'], queryFn: getWarehouses, staleTime: 10 * 60_000, enabled: visible });
  const warehouses = useMemo(() => (warehousesQ.data ?? []).filter((w) => w.isActive), [warehousesQ.data]);

  useEffect(() => {
    if (!visible) return;
    setQty({});
    setNote('');
  }, [visible, order.id]);

  useEffect(() => {
    if (warehouseId || warehouses.length === 0) return;
    setWarehouseId((warehouses.find((w) => w.isDefault) ?? warehouses[0]).id);
  }, [warehouses, warehouseId]);

  const lines = order.items.filter((i) => (qty[i.id] ?? 0) > 0);
  const estimate = lines.reduce((sum, i) => sum + unitNet(i) * (qty[i.id] ?? 0), 0);

  async function submit() {
    if (!warehouseId || lines.length === 0) return;
    const ok = await confirm({
      title: t('erp.return.confirmTitle'),
      message: t('erp.return.confirmMessage', { amount: money(estimate), order: order.orderNumber }),
      confirmText: t('erp.return.submit'),
    });
    if (!ok) return;
    setSaving(true);
    try {
      const id = await createSalesReturn({
        returnType: 1,
        salesOrderId: order.id,
        customerId: order.customerId ?? null,
        warehouseId,
        note: note.trim() || null,
        lines: lines.map((i) => ({ productId: i.productId, quantity: qty[i.id] ?? 0, price: unitNet(i) })),
      });
      // Phiếu vừa tạo: server đã đặt lại giá theo hoá đơn — hoàn đúng tổng của phiếu.
      await completeSalesReturn(id.id, id.returnTotal ?? estimate);
      toast.success(t('erp.return.done', { amount: money(id.returnTotal ?? estimate) }));
      void queryClient.invalidateQueries({ queryKey: ['erp'] });
      onClose();
    } catch (err) {
      toast.error(extractApiError(err), t('erp.return.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={t('erp.return.title', { order: order.orderNumber })}
      onClose={onClose}
      footer={
        <View className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text variant="caption" tone="muted">{t('erp.return.refund')}</Text>
            <Text variant="headline" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{money(estimate)}</Text>
          </View>
          <View className="flex-1">
            <Button icon="keyboard-return" disabled={lines.length === 0 || !warehouseId || saving} loading={saving} onPress={() => void submit()}>
              {t('erp.return.submit')}
            </Button>
          </View>
        </View>
      }
    >
      <View className="gap-3">
        <Text variant="caption" tone="muted">{t('erp.return.hint')}</Text>
        {order.items.map((i, idx) => (
          <View key={i.id}>
            {idx > 0 ? <Divider /> : null}
            <View className="flex-row items-center gap-3 py-2">
              <View className="flex-1">
                <Text variant="bodySmall" className="font-semibold">{i.productName}</Text>
                <Text variant="caption" tone="muted">
                  {t('erp.return.sold', { qty: fmtQty(i.quantity) })} · {money(unitNet(i))}
                </Text>
              </View>
              <Stepper
                value={qty[i.id] ?? 0}
                min={0}
                max={Math.max(0, Math.floor(i.quantity))}
                onChange={(n) => setQty((q) => ({ ...q, [i.id]: n }))}
              />
            </View>
          </View>
        ))}

        {warehouses.length > 1 ? (
          <View className="gap-1.5">
            <Text variant="label" tone="muted">{t('erp.return.warehouse')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {warehouses.map((w) => (
                <Chip key={w.id} label={w.name} selected={w.id === warehouseId} color="primary" onPress={() => setWarehouseId(w.id)} />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <TextField label={t('erp.return.note')} value={note} onChangeText={setNote} maxLength={200} />
      </View>
    </Sheet>
  );
}
