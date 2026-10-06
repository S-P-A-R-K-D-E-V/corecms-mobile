import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppHeader, Sheet, BarcodeScannerModal, type HeaderAction } from 'src/components/shared';
import { Text, Icon, Pressable, Button, Divider, Chip } from 'src/components/ui';
import { toast, confirm } from 'src/components/overlay';
import { brand, grey, softShadow } from 'src/theme';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { useAuthContext } from 'src/auth/auth-context';
import { isManagerUser, usesAdminShell } from 'src/auth/roles';
import { useResponsive } from 'src/hooks/use-responsive';
import { getProducts, getWarehouses } from 'src/api/erp';
import { t } from 'src/i18n';
import type { ICreateSaleResponse, IProductChild, IProductListItem } from 'src/types/erp';

import { StockBadge, childStock, money, fmtQty } from 'src/features/erp/shared';
import { isSaleQueuedForKiotViet } from 'src/features/erp/kiotviet-sync';
import { useWorkingBranch } from 'src/features/branch/working-branch';
import { WorkingBranchSheet } from 'src/features/branch/WorkingBranchSheet';
import { useCart, cartCount, cartTotal, lineFromProduct, lineFromVariant } from './cart-store';
import { CartPanel } from './CartPanel';
import { PaymentPanel, type PaymentState } from './PaymentPanel';
import { ProductPicker } from './ProductPicker';
import { sendSale } from './checkout';
import { buildSaleDraft } from './sale-request';
import { cartPaneWidth, isSplitPos } from './pos-layout';

// ----------------------------------------------------------------------
// Bán hàng trên app: chọn hàng (tìm / quét mã / lọc nhóm), giỏ hàng, thanh toán → core-be tạo hoá đơn và trừ tồn.
// Hoá đơn chỉ được đẩy sang KiotViet khi cửa hàng có đẩy hoá đơn (core-be trả kiotVietSyncStatus = Pending);
// còn lại chỉ lưu trong hệ thống (NotPushed) — bảng "Đã bán xong" chỉ nhắc KiotViet khi đơn thật sự chờ đẩy.
// Nhân viên bán đúng giá niêm yết; quản lý được sửa giá dòng (core-be chặn ở server).
//
// Màn này chỉ ghép các khung ProductPicker / CartPanel / PaymentPanel theo thiết bị (pos-layout.ts):
//   - điện thoại, tablet cầm dọc: danh sách hàng + thanh giỏ nổi, giỏ và thanh toán mở bằng bảng trượt (như trước);
//   - tablet xoay ngang: hai khung — hàng bên trái, giỏ + thanh toán bên phải; thanh tab ẩn, có nút quay lại.
// Hoá đơn ghi vào chi nhánh đang làm việc của máy (working-branch.ts). Mỗi lần bán có mã chống trùng; hết 15 giây
// chưa có trả lời thì giỏ khoá và hiện "Đang kiểm tra hoá đơn" để gửi lại đúng mã đó (sale-request.ts).
// ----------------------------------------------------------------------

const TAB_CLEARANCE = 96;

/** Thân bảng "Đang kiểm tra hoá đơn": chưa biết lần bán vừa rồi đã thành hoá đơn hay chưa. */
function SaleCheckPanel({
  amount,
  busy,
  stillUnknown,
  onRetry,
  onDrop,
}: {
  amount: number;
  busy: boolean;
  stillUnknown: boolean;
  onRetry: () => void;
  onDrop: () => void;
}) {
  return (
    <View className="gap-3">
      <View className="items-center gap-2 py-1">
        <View className="w-16 h-16 rounded-full bg-warning-soft items-center justify-center">
          <Icon name="timer-sand" size={32} tone="warning" />
        </View>
        <Text variant="bodySmall" className="text-center">{t('erp.saleCheckMsg', { amount: money(amount) })}</Text>
        {stillUnknown ? (
          <Text variant="caption" tone="warning" className="text-center font-semibold">{t('erp.saleCheckStill')}</Text>
        ) : null}
      </View>
      <Button icon="refresh" loading={busy} onPress={onRetry}>{t('erp.saleCheckRetry')}</Button>
      <Button variant="ghost" action="error" disabled={busy} onPress={onDrop}>{t('erp.saleCheckDrop')}</Button>
    </View>
  );
}

export function PosScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { user } = useAuthContext();
  const { width, isTablet, isLandscape } = useResponsive();
  const split = isSplitPos({ isTablet, isLandscape });
  const canEditPrice = isManagerUser(user);

  const lines = useCart((s) => s.lines);
  const add = useCart((s) => s.add);
  const clear = useCart((s) => s.clear);
  const pending = useCart((s) => s.pending);
  const dropPendingSale = useCart((s) => s.dropPendingSale);
  // Lần bán chưa biết kết quả (hết giờ, mất mạng, app bị tắt lúc đang gửi): giỏ khoá, chỉ được kiểm tra lại.
  const checking = pending?.status === 'unknown';

  const branch = useWorkingBranch((s) => s.branch);
  const branchOptions = useWorkingBranch((s) => s.options);
  const needsBranch = useWorkingBranch((s) => s.needsPick);
  const manyBranches = (branchOptions?.length ?? 0) > 1;

  const warehousesQ = useQuery({ queryKey: ['erp', 'warehouses'], queryFn: getWarehouses, staleTime: 10 * 60_000 });
  const warehouses = useMemo(() => (warehousesQ.data ?? []).filter((w) => w.isActive), [warehousesQ.data]);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const warehouse = warehouses.find((w) => w.id === warehouseId) ?? warehouses.find((w) => w.isDefault) ?? warehouses[0];

  // Màn Bán hàng là một tab nên vẫn nằm đó khi sang tab khác — bảng tự mở chỉ được hiện lúc màn này đang mở.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // Máy quầy mở cả ngày: mỗi lần vào màn, danh sách chi nhánh đã cũ thì hỏi lại để đối chiếu chi nhánh đang làm việc.
      void qc.refetchQueries({ queryKey: ['branches'], stale: true });
      return () => setFocused(false);
    }, [qc])
  );

  const [scanning, setScanning] = useState(false);
  const [variantOf, setVariantOf] = useState<IProductListItem | null>(null);
  const [sheet, setSheet] = useState<'cart' | 'pay' | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [note, setNote] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [done, setDone] = useState<ICreateSaleResponse | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [stillUnknown, setStillUnknown] = useState(false);
  // 'thenPay' = đang bấm Thanh toán thì phải chọn chi nhánh trước, chọn xong mở thanh toán luôn.
  const [branchPick, setBranchPick] = useState<'open' | 'thenPay' | null>(null);

  const total = cartTotal(lines);
  const count = cartCount(lines);
  const inCart = useCallback(
    (p: IProductListItem) => lines.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0),
    [lines]
  );

  useEffect(() => {
    if (sheet === 'pay') setTransferRef(`TT ${Date.now().toString().slice(-6)}`);
  }, [sheet]);

  // Còn lần bán chờ kiểm tra: vào màn là mở bảng kiểm tra; có kết quả dứt khoát thì tự đóng.
  useEffect(() => {
    setCheckOpen(focused && checking);
    if (!checking) setStillUnknown(false);
  }, [focused, checking]);

  // Cửa hàng nhiều chi nhánh mà máy chưa có chi nhánh (chưa chọn / chi nhánh đã chọn không còn): vào màn là hỏi.
  useEffect(() => {
    if (focused && needsBranch) setBranchPick((v) => v ?? 'open');
  }, [focused, needsBranch]);

  /** Thêm vào giỏ; giỏ đang khoá vì lần bán trước chưa xong thì báo và mở lại bảng kiểm tra. */
  function addLine(line: Parameters<typeof add>[0]): boolean {
    if (add(line)) {
      haptics.light();
      return true;
    }
    toast.info(t('erp.saleCheckLocked'));
    if (checking) setCheckOpen(true);
    return false;
  }

  function addProduct(p: IProductListItem): boolean {
    const variants = (p.childProducts ?? []).filter((c) => c.isActive);
    if (p.hasVariants && variants.length === 1) {
      // KiotViet CiCi: hầu hết hàng có đúng 1 biến thể → thêm thẳng, khỏi mở bảng chọn.
      return addVariant(p, variants[0]);
    }
    if (p.hasVariants && variants.length > 1) {
      setVariantOf(p);
      return true;
    }
    return addLine(lineFromProduct(p));
  }

  function addVariant(parent: IProductListItem, c: IProductChild): boolean {
    const added = addLine(lineFromVariant(parent, c));
    setVariantOf(null);
    return added;
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
      const added = child ? addVariant(parent, child) : addProduct(parent);
      if (added) toast.success(t('erp.added', { name: child?.fullName || child?.name || parent.name }));
    } catch (err) {
      toast.error(extractApiError(err));
    }
  }

  const sellerName = user ? `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim() || user.email : undefined;

  const sale = useMutation({
    // 'pay': lần bán mới từ giỏ; 'recheck': gửi lại đúng gói đang chờ kiểm tra (cùng mã chống trùng).
    mutationFn: (mode: 'pay' | 'recheck') =>
      sendSale(
        mode === 'recheck'
          ? 'recheck'
          : buildSaleDraft({
              lines,
              payment: payment!,
              warehouseId: warehouse?.id,
              branchRefId: branch?.id,
              note,
              soldByName: sellerName,
            })
      ),
    onMutate: () => setStillUnknown(false),
    onSuccess: (attempt, mode) => {
      if (attempt.kind === 'created') {
        // Giỏ đã được xoá trong sendSale.
        haptics.success();
        setNote('');
        setSheet(null);
        setDone(attempt.sale);
        qc.invalidateQueries({ predicate: (x) => ['erp', 'admin', 'home'].includes(x.queryKey[0] as string) });
      } else if (attempt.kind === 'rejected') {
        toast.error(extractApiError(attempt.error), t('erp.saleFailed'));
        // Có thể bị từ chối vì chi nhánh đang làm việc vừa ngừng hoạt động → hỏi lại danh sách để chọn lại.
        void qc.invalidateQueries({ queryKey: ['branches'] });
      } else {
        // Chưa biết kết quả: đóng bảng thanh toán — giỏ đã khoá, bảng "Đang kiểm tra hoá đơn" tự mở.
        setSheet(null);
        if (mode === 'recheck') setStillUnknown(true);
      }
    },
  });

  async function dropCheck() {
    if (await confirm({ title: t('erp.saleCheckDrop'), message: t('erp.saleCheckDropConfirm'), destructive: true })) {
      dropPendingSale();
    }
  }

  function goPay() {
    // Cửa hàng nhiều chi nhánh: phải biết máy đang bán ở chi nhánh nào trước khi thu tiền.
    if (!branch && manyBranches) {
      setSheet(null);
      setBranchPick('thenPay');
      return;
    }
    setSheet('pay');
  }

  async function clearCart() {
    if (await confirm({ title: t('erp.clearCart'), message: t('erp.clearCartConfirm'), destructive: true })) {
      clear();
      setSheet(null);
    }
  }

  // ── Các mảnh dùng chung cho cả hai bố cục ──────────────────────────────

  const userName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const headerActions: HeaderAction[] | undefined = manyBranches
    ? [{ icon: 'store-marker-outline', onPress: () => setBranchPick('open') }]
    : undefined;

  const pickerHeader = (
    <>
      <AppHeader
        // Hai khung: thanh tab ẩn nên luôn có nút quay lại.
        back={split || !usesAdminShell(user)}
        title={t('tabs.pos')}
        subtitle={[userName, branch?.name].filter(Boolean).join(' · ') || undefined}
        actions={headerActions}
      />
      {warehouses.length > 1 ? (
        <View className="flex-row flex-wrap gap-2 -mt-1">
          {warehouses.map((w) => (
            <Chip key={w.id} size="sm" icon="warehouse" label={w.name} selected={w.id === warehouse?.id} color="primary" onPress={() => setWarehouseId(w.id)} />
          ))}
        </View>
      ) : null}
    </>
  );

  const paying = sheet === 'pay';
  const cartTitle = `${t('erp.cart')} · ${t('erp.cartItems', { n: fmtQty(count) })}`;

  const payBody = (
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
  );

  const payFooter = (
    <View className="flex-row gap-2">
      <View style={{ width: 132 }}>
        <Button variant="soft" icon="chevron-left" onPress={() => setSheet('cart')}>{t('erp.cart')}</Button>
      </View>
      <View className="flex-1">
        <Button icon="check" loading={sale.isPending} disabled={!payment?.ready || lines.length === 0} onPress={() => sale.mutate('pay')}>
          {t('erp.complete')}
        </Button>
      </View>
    </View>
  );

  const cartFooter = (
    <View className="flex-row gap-2">
      <View style={{ width: 110 }}>
        <Button variant="ghost" action="error" onPress={clearCart}>
          {t('erp.clearCart')}
        </Button>
      </View>
      <View className="flex-1">
        <Button icon="cash-register" disabled={lines.length === 0} onPress={goPay}>
          {`${t('erp.checkout')} · ${money(total)}`}
        </Button>
      </View>
    </View>
  );

  const checkBody = (
    <SaleCheckPanel
      amount={pending?.request.totalPayment ?? total}
      busy={sale.isPending}
      stillUnknown={stillUnknown}
      onRetry={() => sale.mutate('recheck')}
      onDrop={dropCheck}
    />
  );

  // Mỗi lúc chỉ một bảng trượt: kiểm tra hoá đơn trước, rồi tới chọn chi nhánh khi không có bảng nào khác đang mở.
  const checkSheetOpen = !split && focused && checkOpen;
  const cartSheetOpen = !split && sheet !== null && !checkSheetOpen;
  const branchSheetOpen =
    focused && branchPick !== null && !checkSheetOpen && !cartSheetOpen && !variantOf && !done && !scanning;

  const overlays = (
    <>
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

      {/* Chi nhánh đang làm việc */}
      <WorkingBranchSheet
        visible={branchSheetOpen}
        onClose={() => setBranchPick(null)}
        onPicked={() => {
          if (branchPick === 'thenPay') setSheet('pay');
        }}
      />

      <BarcodeScannerModal visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />
    </>
  );

  // Khung chọn hàng luôn nằm cùng một chỗ trong cây giao diện ở cả hai bố cục → xoay máy không mất ô tìm kiếm,
  // nhóm đang lọc và vị trí cuộn.
  return (
    <View
      className={split ? 'flex-1 flex-row bg-bg dark:bg-bg-dark' : 'flex-1 bg-bg dark:bg-bg-dark'}
      style={split ? { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right } : { paddingTop: insets.top }}
    >
      <View className="flex-1">
        <ProductPicker
          header={pickerHeader}
          inCart={inCart}
          onPick={addProduct}
          onScan={() => setScanning(true)}
          // Hai khung: thanh tab đã ẩn. Một cột: chừa thanh tab nổi + thanh giỏ nổi.
          bottomInset={split ? Math.max(insets.bottom, 8) + 16 : TAB_CLEARANCE + insets.bottom + (count || checking ? 76 : 0)}
        />
      </View>

      {split ? (
        // ── Tablet xoay ngang: giỏ hàng + thanh toán nằm sẵn bên phải ──
        <View style={{ width: cartPaneWidth(width) }} className="border-l border-line/70 dark:border-line-dark bg-surface dark:bg-surface-dark">
          <View className="px-5 pt-3 pb-1">
            <Text variant="title2" numberOfLines={1}>
              {checking ? t('erp.saleCheckTitle') : paying ? t('erp.checkout') : cartTitle}
            </Text>
          </View>
          <ScrollView
            className="flex-1"
            contentContainerClassName="px-5 py-2"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            {checking ? checkBody : paying ? payBody : <CartPanel lines={lines} canEditPrice={canEditPrice} />}
          </ScrollView>
          {checking ? null : (
            <View
              className="px-5 pt-2 border-t border-line/70 dark:border-line-dark"
              style={{ paddingBottom: Math.max(insets.bottom, 12) }}
            >
              {paying ? payFooter : cartFooter}
            </View>
          )}
        </View>
      ) : (
        // ── Điện thoại / tablet cầm dọc: thanh nổi + bảng trượt như trước ──
        <>
          {/* Thanh nổi trên thanh tab: đang kiểm tra hoá đơn, hoặc giỏ hàng */}
          {checking || count > 0 ? (
            <View style={{ position: 'absolute', left: 12, right: 12, bottom: TAB_CLEARANCE + Math.max(insets.bottom, 8) - 8 }}>
              {checking ? (
                <Pressable onPress={() => setCheckOpen(true)} className="flex-row items-center gap-3 rounded-2xl bg-warning px-4 h-14" style={softShadow}>
                  <Icon name="timer-sand" size={22} color={brand.ink} />
                  {/* Chữ tối trên nền vàng ở cả chế độ sáng lẫn tối. */}
                  <Text className="flex-1 font-bold" style={{ color: brand.ink }} numberOfLines={1}>{t('erp.saleCheckTitle')}</Text>
                  <Text className="font-bold" style={{ color: brand.ink }}>{t('erp.saleCheckRetry')}</Text>
                  <Icon name="chevron-right" size={20} color={brand.ink} />
                </Pressable>
              ) : (
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
              )}
            </View>
          ) : null}

          {/* Giỏ hàng → thanh toán */}
          <Sheet
            visible={cartSheetOpen}
            title={paying ? t('erp.checkout') : cartTitle}
            onClose={() => setSheet(null)}
            footer={paying ? payFooter : cartFooter}
          >
            {paying ? payBody : <CartPanel lines={lines} canEditPrice={canEditPrice} />}
          </Sheet>

          {/* Đang kiểm tra hoá đơn */}
          <Sheet visible={checkSheetOpen} title={t('erp.saleCheckTitle')} onClose={() => setCheckOpen(false)}>
            {checkBody}
          </Sheet>
        </>
      )}

      {overlays}
    </View>
  );
}
