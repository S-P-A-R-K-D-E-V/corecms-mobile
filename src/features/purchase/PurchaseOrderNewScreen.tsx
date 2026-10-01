import { useMemo, useState } from 'react';
import { View, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'nativewind';

import { Screen, AppHeader, SectionCard, Sheet, EmptyState } from 'src/components/shared';
import { Text, Icon, Pressable, Button, Divider, Chip, Spinner } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { brand, grey } from 'src/theme';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { createPurchaseOrder, getSuppliers, getWarehouses } from 'src/api/erp';
import { t } from 'src/i18n';
import type { IProductListItem, ISupplier } from 'src/types/erp';

import { SearchBar, avgCost, money, useDebounced } from 'src/features/erp/shared';
import { useProductSearch } from 'src/features/products/hooks';

// ----------------------------------------------------------------------
// Tạo phiếu nhập (lưu phiếu tạm): nhà cung cấp, kho, các mặt hàng + số lượng + giá nhập (gợi ý giá vốn
// hiện tại). Xác nhận / nhận hàng làm ở trang chi tiết.
// ----------------------------------------------------------------------

type Line = { productId: string; name: string; code: string; qty: number; cost: number };

/** Hàng có biến thể → mỗi biến thể là 1 dòng chọn được (nhập kho theo row con). */
function pickables(items: IProductListItem[]) {
  return items.flatMap((p) =>
    p.hasVariants && (p.childProducts ?? []).length
      ? (p.childProducts ?? [])
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.fullName || c.name, code: c.code, cost: avgCost(c.inventories) ?? 0 }))
      : [{ id: p.id, name: p.name, code: p.code, cost: avgCost(p.inventories) ?? 0 }]
  );
}

function NumberBox({ value, onChange, width = 110 }: { value: number; onChange: (n: number) => void; width?: number }) {
  const { colorScheme } = useColorScheme();
  return (
    <TextInput
      value={value ? value.toLocaleString('vi-VN') : ''}
      onChangeText={(v) => onChange(Number(v.replace(/[^0-9]/g, '') || 0))}
      keyboardType="number-pad"
      placeholder="0"
      placeholderTextColor={grey[500]}
      style={{
        width,
        height: 38,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(145,158,171,0.32)',
        fontWeight: '700',
        textAlign: 'right',
        color: colorScheme === 'dark' ? '#FFFFFF' : brand.ink,
      }}
    />
  );
}

export function PurchaseOrderNewScreen() {
  const qc = useQueryClient();
  const { colorScheme } = useColorScheme();
  const [supplier, setSupplier] = useState<ISupplier | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState('');
  const [picker, setPicker] = useState<'supplier' | 'product' | null>(null);
  const [supplierKw, setSupplierKw] = useState('');
  const [productKw, setProductKw] = useState('');
  const sKw = useDebounced(supplierKw);
  const pKw = useDebounced(productKw);

  const warehousesQ = useQuery({ queryKey: ['erp', 'warehouses'], queryFn: getWarehouses, staleTime: 10 * 60_000 });
  const warehouses = useMemo(() => (warehousesQ.data ?? []).filter((w) => w.isActive), [warehousesQ.data]);
  const warehouse = warehouses.find((w) => w.id === warehouseId) ?? warehouses.find((w) => w.isDefault) ?? warehouses[0];

  const suppliersQ = useQuery({ queryKey: ['erp', 'suppliers', sKw], queryFn: () => getSuppliers(sKw), enabled: picker === 'supplier', staleTime: 60_000 });
  const productsQ = useProductSearch(pKw);
  const products = useMemo(() => pickables(productsQ.data?.pages.flatMap((p) => p.items) ?? []), [productsQ.data]);

  const total = lines.reduce((s, l) => s + l.qty * l.cost, 0);
  const valid = !!supplier && !!warehouse && lines.length > 0 && lines.every((l) => l.qty > 0);

  const save = useMutation({
    mutationFn: () =>
      createPurchaseOrder({
        supplierId: supplier!.id,
        warehouseId: warehouse!.id,
        note: note.trim() || undefined,
        discountAmount: 0,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.qty, unitPrice: l.cost, vatRate: 0, discountAmount: 0 })),
      }),
    onSuccess: (res) => {
      haptics.success();
      toast.success(t('erp.poCreated'));
      qc.invalidateQueries({ predicate: (x) => x.queryKey[0] === 'erp' });
      router.replace(`/purchase-orders/${res.id}` as any);
    },
    onError: (err) => toast.error(extractApiError(err), t('erp.actionFailed')),
  });

  function addLine(p: { id: string; name: string; code: string; cost: number }) {
    haptics.light();
    setLines((ls) => (ls.some((l) => l.productId === p.id) ? ls.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l)) : [...ls, { productId: p.id, name: p.name, code: p.code, qty: 1, cost: Math.round(p.cost) }]));
    setPicker(null);
  }

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)));

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader back title={t('erp.newPurchase')} />

      <SectionCard title={t('erp.supplier')} icon="truck-outline" bodyClassName="pt-0 gap-3">
        <Pressable onPress={() => setPicker('supplier')} className="flex-row items-center gap-2 h-12 px-3 rounded-2xl border border-line dark:border-line-dark">
          <Text className="flex-1" tone={supplier ? 'default' : 'muted'} numberOfLines={1}>{supplier?.name ?? t('erp.chooseSupplier')}</Text>
          <Icon name="chevron-down" size={20} tone="muted" />
        </Pressable>
        {warehouses.length > 1 ? (
          <View className="flex-row flex-wrap gap-2">
            {warehouses.map((w) => (
              <Chip key={w.id} size="sm" icon="warehouse" label={w.name} selected={w.id === warehouse?.id} color="primary" onPress={() => setWarehouseId(w.id)} />
            ))}
          </View>
        ) : warehouse ? (
          <Text variant="caption" tone="muted">{t('erp.warehouse')}: {warehouse.name}</Text>
        ) : null}
      </SectionCard>

      <SectionCard
        title={t('erp.items')}
        icon="package-variant-closed"
        count={lines.length}
        right={
          <Pressable onPress={() => setPicker('product')} className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-primary-soft">
            <Icon name="plus" size={14} tone="primary" />
            <Text variant="caption" tone="primary" className="font-semibold">{t('erp.addProduct')}</Text>
          </Pressable>
        }
        bodyClassName="pt-0"
      >
        {lines.length === 0 ? (
          <Pressable onPress={() => setPicker('product')} className="items-center py-4 gap-1">
            <Icon name="package-variant-plus" size={28} tone="faint" />
            <Text variant="bodySmall" tone="muted">{t('erp.addProduct')}</Text>
          </Pressable>
        ) : (
          lines.map((l, i) => (
            <View key={l.productId}>
              {i > 0 ? <Divider /> : null}
              <View className="py-2.5 gap-2">
                <View className="flex-row items-start gap-2">
                  <View className="flex-1">
                    <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{l.name}</Text>
                    <Text variant="caption" tone="muted">{l.code}</Text>
                  </View>
                  <Pressable onPress={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))} hitSlop={8}>
                    <Icon name="close" size={18} tone="faint" />
                  </Pressable>
                </View>
                <View className="flex-row items-end gap-2">
                  <View className="gap-1">
                    <Text variant="caption" tone="muted">{t('erp.qty')}</Text>
                    <NumberBox value={l.qty} width={72} onChange={(n) => update(l.productId, { qty: n })} />
                  </View>
                  <View className="gap-1">
                    <Text variant="caption" tone="muted">{t('erp.unitCost')}</Text>
                    <NumberBox value={l.cost} width={124} onChange={(n) => update(l.productId, { cost: n })} />
                  </View>
                  <Text variant="bodySmall" className="flex-1 text-right font-bold pb-2.5">{money(l.qty * l.cost)}</Text>
                </View>
              </View>
            </View>
          ))
        )}
        {lines.length > 0 ? (
          <>
            <Divider className="my-1.5" />
            <View className="flex-row justify-between">
              <Text variant="bodySmall" tone="muted">{t('erp.total')}</Text>
              <Text variant="headline" tone="primary" className="font-bold">{money(total)}</Text>
            </View>
          </>
        ) : null}
      </SectionCard>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t('erp.note')}
        placeholderTextColor={grey[500]}
        multiline
        style={{ minHeight: 56, color: colorScheme === 'dark' ? '#FFFFFF' : brand.ink }}
        className="px-3 py-2.5 rounded-2xl border border-line dark:border-line-dark"
      />

      {!valid && (lines.length > 0 || supplier) ? <Text variant="caption" tone="muted">{t('erp.poMissing')}</Text> : null}
      <Button icon="content-save-outline" disabled={!valid} loading={save.isPending} onPress={() => save.mutate()}>
        {t('erp.createPo')}
      </Button>

      <Sheet visible={picker === 'supplier'} title={t('erp.chooseSupplier')} onClose={() => setPicker(null)}>
        <SearchBar value={supplierKw} onChange={setSupplierKw} placeholder={t('erp.searchSupplier')} loading={suppliersQ.isFetching} />
        <View className="mt-2">
          {(suppliersQ.data ?? []).slice(0, 40).map((s, i) => (
            <View key={s.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() => {
                  setSupplier(s);
                  setPicker(null);
                }}
                className="flex-row items-center gap-3 py-3"
              >
                <View className="flex-1">
                  <Text variant="bodySmall" className="font-semibold">{s.name}</Text>
                  {s.contactNumber || s.code ? <Text variant="caption" tone="muted">{[s.code, s.contactNumber].filter(Boolean).join('  ·  ')}</Text> : null}
                </View>
                {supplier?.id === s.id ? <Icon name="check" size={18} tone="primary" /> : null}
              </Pressable>
            </View>
          ))}
          {suppliersQ.isLoading ? <Spinner /> : null}
          {!suppliersQ.isLoading && (suppliersQ.data ?? []).length === 0 ? <EmptyState icon="truck-outline" title={t('erp.noResults')} /> : null}
        </View>
      </Sheet>

      <Sheet visible={picker === 'product'} title={t('erp.addProduct')} onClose={() => setPicker(null)}>
        <SearchBar value={productKw} onChange={setProductKw} placeholder={t('erp.search')} loading={productsQ.isFetching && !!pKw} />
        <View className="mt-2">
          {products.slice(0, 40).map((item, i) => (
            <View key={item.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable onPress={() => addLine(item)} className="flex-row items-center gap-3 py-3">
                <View className="flex-1">
                  <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{item.name}</Text>
                  <Text variant="caption" tone="muted">{item.code}</Text>
                </View>
                {item.cost ? <Text variant="caption" tone="muted">{money(Math.round(item.cost))}</Text> : null}
                <Icon name="plus-circle-outline" size={22} tone="primary" />
              </Pressable>
            </View>
          ))}
          {productsQ.isLoading ? <Spinner /> : null}
          {!productsQ.isLoading && products.length === 0 ? <EmptyState icon="package-variant" title={t('erp.noResults')} /> : null}
        </View>
      </Sheet>
    </Screen>
  );
}
