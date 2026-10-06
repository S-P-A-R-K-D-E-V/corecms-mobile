import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, FlatList, TextInput } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useColorScheme } from 'nativewind';

import { AppHeader, EmptyState, Sheet, BarcodeScannerModal } from 'src/components/shared';
import { Text, Icon, Pressable, Button, Divider, Skeleton, Chip } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast, confirm } from 'src/components/overlay';
import { brand, grey, softShadow } from 'src/theme';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { useAuthContext } from 'src/auth/auth-context';
import { isManagerUser, usesAdminShell } from 'src/auth/roles';
import { getProducts, getWarehouses, createSale } from 'src/api/erp';
import { t } from 'src/i18n';
import type { ICreateSaleResponse, IProductChild, IProductListItem } from 'src/types/erp';

import { SearchBar, ProductThumb, StockBadge, ListFooter, priceLabel, stockOf, childStock, money, fmtQty, useDebounced } from 'src/features/erp/shared';
import { isSaleQueuedForKiotViet } from 'src/features/erp/kiotviet-sync';
import { useProductSearch } from 'src/features/products/hooks';
import { useCart, cartCount, cartTotal, lineFromProduct, lineFromVariant, type CartLine } from './cart-store';
import { PaymentPanel, type PaymentState } from './PaymentPanel';

// ----------------------------------------------------------------------
// Bán hàng trên app: chọn hàng (tìm / quét mã), giỏ hàng, thanh toán → core-be tạo hoá đơn và trừ tồn.
// Hoá đơn chỉ được đẩy sang KiotViet khi cửa hàng có đẩy hoá đơn (core-be trả kiotVietSyncStatus = Pending);
// còn lại chỉ lưu trong hệ thống (NotPushed) — bảng "Đã bán xong" chỉ nhắc KiotViet khi đơn thật sự chờ đẩy.
// Nhân viên bán đúng giá niêm yết; quản lý được sửa giá dòng (core-be chặn ở server).
// ----------------------------------------------------------------------

const TAB_CLEARANCE = 96;

function ProductPickRow({ item, inCart, onPress }: { item: IProductListItem; inCart: number; onPress: () => void }) {
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

function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center rounded-xl border border-line dark:border-line-dark">
      <Pressable onPress={() => onChange(value - 1)} hitSlop={6} className="w-9 h-9 items-center justify-center">
        <Icon name={value <= 1 ? 'trash-can-outline' : 'minus'} size={18} tone={value <= 1 ? 'error' : 'default'} />
      </Pressable>
      <Text className="min-w-[28px] text-center font-bold" style={{ fontVariant: ['tabular-nums'] }}>{fmtQty(value)}</Text>
      <Pressable onPress={() => onChange(value + 1)} hitSlop={6} className="w-9 h-9 items-center justify-center">
        <Icon name="plus" size={18} tone="primary" />
      </Pressable>
    </View>
  );
}

function CartLineRow({ line, canEditPrice }: { line: CartLine; canEditPrice: boolean }) {
  const { colorScheme } = useColorScheme();
  const setQty = useCart((s) => s.setQty);
  const setPrice = useCart((s) => s.setPrice);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(line.price));
  const changed = line.price !== line.listPrice;

  return (
    <View className="py-2.5 gap-1.5">
      <View className="flex-row items-start gap-2">
        <View className="flex-1">
          <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{line.name}</Text>
          <Text variant="caption" tone="muted">
            {line.code}
            {line.qty > line.stock ? `  ·  ${t('erp.stock', { n: fmtQty(line.stock) })}` : ''}
          </Text>
        </View>
        <Text variant="bodySmall" className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{money(line.price * line.qty)}</Text>
      </View>
      <View className="flex-row items-center justify-between">
        {canEditPrice && editing ? (
          <View className="flex-row items-center gap-2">
            <TextInput
              value={text}
              onChangeText={(v) => setText(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              autoFocus
              onBlur={() => {
                setPrice(line.key, Number(text || 0));
                setEditing(false);
              }}
              style={{
                minWidth: 110,
                height: 36,
                paddingHorizontal: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: brand.primary,
                fontWeight: '700',
                color: colorScheme === 'dark' ? '#FFFFFF' : brand.ink,
              }}
            />
          </View>
        ) : (
          <Pressable
            disabled={!canEditPrice}
            onPress={() => {
              setText(String(line.price));
              setEditing(true);
            }}
            className="flex-row items-center gap-1"
          >
            <Text variant="caption" tone={changed ? 'warning' : 'muted'} className="font-semibold">
              {money(line.price)}
              {changed ? `  (${money(line.listPrice)})` : ''}
            </Text>
            <Icon name={canEditPrice ? 'pencil-outline' : 'lock-outline'} size={13} tone="faint" />
          </Pressable>
        )}
        <QtyStepper value={line.qty} onChange={(n) => setQty(line.key, n)} />
      </View>
    </View>
  );
}

export function PosScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const canEditPrice = isManagerUser(user);
  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const clear = useCart((s) => s.clear);

  const [keyword, setKeyword] = useState('');
  const q = useDebounced(keyword);
  const query = useProductSearch(q);
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);

  const warehousesQ = useQuery({ queryKey: ['erp', 'warehouses'], queryFn: getWarehouses, staleTime: 10 * 60_000 });
  const warehouses = useMemo(() => (warehousesQ.data ?? []).filter((w) => w.isActive), [warehousesQ.data]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const warehouse = warehouses.find((w) => w.id === warehouseId) ?? warehouses.find((w) => w.isDefault) ?? warehouses[0];

  const [scanning, setScanning] = useState(false);
  const [variantOf, setVariantOf] = useState<IProductListItem | null>(null);
  const [sheet, setSheet] = useState<'cart' | 'pay' | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [note, setNote] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [done, setDone] = useState<ICreateSaleResponse | null>(null);

  const total = cartTotal(lines);
  const count = cartCount(lines);
  const inCart = useCallback(
    (p: IProductListItem) => lines.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0),
    [lines]
  );

  useEffect(() => {
    if (sheet === 'pay') setTransferRef(`TT ${Date.now().toString().slice(-6)}`);
  }, [sheet]);

  function addProduct(p: IProductListItem) {
    const variants = (p.childProducts ?? []).filter((c) => c.isActive);
    if (p.hasVariants && variants.length === 1) {
      // KiotViet CiCi: hầu hết hàng có đúng 1 biến thể → thêm thẳng, khỏi mở bảng chọn.
      addVariant(p, variants[0]);
      return;
    }
    if (p.hasVariants && variants.length > 1) {
      setVariantOf(p);
      return;
    }
    haptics.light();
    add(lineFromProduct(p));
  }

  function addVariant(parent: IProductListItem, c: IProductChild) {
    haptics.light();
    add(lineFromVariant(parent, c));
    setVariantOf(null);
  }

  async function onScanned(code: string) {
    try {
      const res = await getProducts({ keyword: code, pageSize: 5 });
      const exact = res.items.find((p) => p.barCode === code || p.code === code);
      const parent = exact ?? res.items.find((p) => (p.childProducts ?? []).some((c) => c.barCode === code || c.code === code));
      if (!parent) {
        toast.info(t('erp.notFoundCode', { code }));
        return;
      }
      const child = (parent.childProducts ?? []).find((c) => c.barCode === code || c.code === code);
      if (child) addVariant(parent, child);
      else addProduct(parent);
      toast.success(t('erp.added', { name: child?.fullName || child?.name || parent.name }));
    } catch (err) {
      toast.error(extractApiError(err));
    }
  }

  const sellerName = user ? `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim() || user.email : undefined;

  const sale = useMutation({
    mutationFn: () =>
      createSale({
        totalPayment: total,
        method: payment!.method,
        warehouseId: warehouse?.id,
        note: note.trim() || undefined,
        soldByName: sellerName,
        invoiceDetails: lines.map((l) => ({
          productId: l.productId,
          productVariantId: l.variantId,
          productCode: l.code,
          productName: l.name,
          quantity: l.qty,
          price: l.price,
        })),
        payments: [
          {
            method: payment!.method,
            amount: total,
            accountId: payment!.method === 'Transfer' ? payment!.account?.kiotVietId ?? undefined : undefined,
            transactionRef: payment!.method === 'Transfer' ? payment!.transferRef : undefined,
          },
        ],
      }),
    onSuccess: (res) => {
      haptics.success();
      clear();
      setNote('');
      setSheet(null);
      setDone(res);
      qc.invalidateQueries({ predicate: (x) => ['erp', 'admin', 'home'].includes(x.queryKey[0] as string) });
    },
    onError: (err) => toast.error(extractApiError(err), t('erp.saleFailed')),
  });

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2 gap-3">
        <AppHeader back={!usesAdminShell(user)} title={t('tabs.pos')} subtitle={`${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || undefined} />
        {warehouses.length > 1 ? (
          <View className="flex-row flex-wrap gap-2 -mt-1">
            {warehouses.map((w) => (
              <Chip key={w.id} size="sm" icon="warehouse" label={w.name} selected={w.id === warehouse?.id} color="primary" onPress={() => setWarehouseId(w.id)} />
            ))}
          </View>
        ) : null}
        <SearchBar value={keyword} onChange={setKeyword} placeholder={t('erp.search')} onScan={() => setScanning(true)} loading={query.isFetching && !query.isFetchingNextPage && !!q} />
      </View>

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
          renderItem={({ item }) => <ProductPickRow item={item} inCart={inCart(item)} onPress={() => addProduct(item)} />}
          ItemSeparatorComponent={() => <View className="h-px bg-line/60 dark:bg-line-dark ml-[68px]" />}
          contentContainerStyle={{ paddingTop: 6, paddingBottom: TAB_CLEARANCE + insets.bottom + (count ? 76 : 0) }}
          onEndReached={() => query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()}
          onEndReachedThreshold={0.4}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={<EmptyState icon="package-variant" title={t('erp.noResults')} />}
          ListFooterComponent={<ListFooter loading={query.isFetchingNextPage} />}
        />
      )}

      {/* Thanh giỏ hàng nổi trên thanh tab */}
      {count > 0 ? (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: TAB_CLEARANCE + Math.max(insets.bottom, 8) - 8 }}>
          <Pressable
            onPress={() => setSheet('cart')}
            className="flex-row items-center gap-3 rounded-2xl bg-primary px-4 h-14"
            style={softShadow}
          >
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}>
              <Text tone="inverse" className="font-bold">{count}</Text>
            </View>
            <Text tone="inverse" className="flex-1 font-bold text-[17px]" style={{ fontVariant: ['tabular-nums'] }}>{money(total)}</Text>
            <Text tone="inverse" className="font-bold">{t('erp.checkout')}</Text>
            <Icon name="chevron-right" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      {/* Chọn biến thể */}
      <Sheet visible={!!variantOf} title={variantOf?.name ?? t('erp.pickVariant')} onClose={() => setVariantOf(null)}>
        {(variantOf?.childProducts ?? []).filter((c) => c.isActive).map((c, i) => (
          <View key={c.id}>
            {i > 0 ? <Divider /> : null}
            <Pressable onPress={() => addVariant(variantOf!, c)} className="flex-row items-center gap-3 py-3">
              <View className="flex-1">
                <Text variant="bodySmall" className="font-semibold">{(c.attributes ?? []).map((a) => a.attributeValue).join(' · ') || c.name}</Text>
                <Text variant="caption" tone="muted">{c.code}</Text>
              </View>
              <StockBadge stock={childStock(c)} />
              <Text variant="bodySmall" className="font-bold w-[90px] text-right">{money(c.basePrice)}</Text>
            </Pressable>
          </View>
        ))}
      </Sheet>

      {/* Giỏ hàng → thanh toán */}
      <Sheet
        visible={sheet !== null}
        title={sheet === 'pay' ? t('erp.checkout') : `${t('erp.cart')} · ${t('erp.cartItems', { n: fmtQty(count) })}`}
        onClose={() => setSheet(null)}
        footer={
          sheet === 'pay' ? (
            <View className="flex-row gap-2">
              <View style={{ width: 132 }}>
                <Button variant="soft" icon="chevron-left" onPress={() => setSheet('cart')}>{t('erp.cart')}</Button>
              </View>
              <View className="flex-1">
                <Button icon="check" loading={sale.isPending} disabled={!payment?.ready || lines.length === 0} onPress={() => sale.mutate()}>
                  {t('erp.complete')}
                </Button>
              </View>
            </View>
          ) : (
            <View className="flex-row gap-2">
              <View style={{ width: 110 }}>
                <Button
                  variant="ghost"
                  action="error"
                  onPress={async () => {
                    if (await confirm({ title: t('erp.clearCart'), message: t('erp.clearCartConfirm'), destructive: true })) {
                      clear();
                      setSheet(null);
                    }
                  }}
                >
                  {t('erp.clearCart')}
                </Button>
              </View>
              <View className="flex-1">
                <Button icon="cash-register" disabled={lines.length === 0} onPress={() => setSheet('pay')}>
                  {`${t('erp.checkout')} · ${money(total)}`}
                </Button>
              </View>
            </View>
          )
        }
      >
        {sheet === 'pay' ? (
          <View className="gap-3">
            <PaymentPanel total={total} transferRef={transferRef} onChange={setPayment} />
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder={t('erp.note')}
              placeholderTextColor={grey[500]}
              className="h-11 px-3 rounded-2xl border border-line dark:border-line-dark text-ink dark:text-ink-dark"
            />
          </View>
        ) : lines.length === 0 ? (
          <EmptyState icon="cart-outline" title={t('erp.emptyCart')} />
        ) : (
          <View>
            {!canEditPrice ? (
              <View className="flex-row items-center gap-1.5 mb-1">
                <Icon name="lock-outline" size={13} tone="muted" />
                <Text variant="caption" tone="muted">{t('erp.priceLocked')}</Text>
              </View>
            ) : null}
            {lines.map((l, i) => (
              <View key={l.key}>
                {i > 0 ? <Divider /> : null}
                <CartLineRow line={l} canEditPrice={canEditPrice} />
              </View>
            ))}
          </View>
        )}
      </Sheet>

      {/* Bán xong */}
      <Sheet visible={!!done} title={t('erp.saleDone')} onClose={() => setDone(null)}>
        <View className="items-center gap-2 py-2">
          <View className="w-16 h-16 rounded-full bg-success-soft items-center justify-center">
            <Icon name="check-bold" size={34} tone="success" />
          </View>
          {isSaleQueuedForKiotViet(done) ? (
            <Text variant="bodySmall" tone="muted" className="text-center">{t('erp.saleSync')}</Text>
          ) : null}
        </View>
        <View className="flex-row gap-2 mt-3">
          <View className="flex-1">
            <Button
              variant="soft"
              icon="receipt"
              onPress={() => {
                const id = done?.id;
                setDone(null);
                if (id) router.push(`/invoices/${id}` as any);
              }}
            >
              {t('erp.viewInvoice')}
            </Button>
          </View>
          <View className="flex-1">
            <Button icon="plus" onPress={() => setDone(null)}>{t('erp.newSale')}</Button>
          </View>
        </View>
      </Sheet>

      <BarcodeScannerModal visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />
    </View>
  );
}
