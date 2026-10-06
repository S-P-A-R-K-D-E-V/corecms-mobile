import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, ScrollView } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import { AppHeader, Sheet, goBackOrHome } from 'src/components/shared';
import { Text, Icon, Pressable, Button } from 'src/components/ui';
import { toast, confirm, showActionSheet } from 'src/components/overlay';
import { softShadow } from 'src/theme';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';
import { isManagerUser } from 'src/auth/roles';
import { useResponsive } from 'src/hooks/use-responsive';
import { getFnbOrder } from 'src/api/fnb';
import { t } from 'src/i18n';
import type { IMenuDish, IOrderLine } from 'src/types/fnb';

import { money } from 'src/features/erp/shared';
import { PaymentPanel, type PaymentState } from 'src/features/pos/PaymentPanel';
import { checkoutPlan } from './checkout-plan';
import { DishOptionsSheet, OpenItemSheet } from './DishSheets';
import { addDraft, draftCount, draftTotal, itemDraft, setDraftQty, toLineInput, type DraftLine } from './draft';
import {
  addLinesCmd,
  billCmd,
  cancelCmd,
  checkoutCmd,
  moveCmd,
  openOrderCmd,
  removePendingLineCmd,
  sendCmd,
  voidCmd,
} from './fnb-commands';
import { newId } from './fnb-ids';
import { isFnbSplit, orderPaneWidth } from './fnb-layout';
import { commandCtx, enqueueFnb, useFnb } from './fnb-store';
import { findTable, type MoveOption } from './floor';
import { defaultVariant, dishNeedsOptions } from './menu';
import { MenuPanel } from './MenuPanel';
import { CancelOrderSheet, MoveSheet, VoidSheet } from './OrderActionSheets';
import { OrderPanel } from './OrderPanel';
import {
  canRunVersioned,
  draftsToRestore,
  entriesOf,
  isUnsyncedNew,
  outboxLines,
  pendingLines,
  voidableLines,
} from './order-view';
import { fnbKeys, useFnbAccess, useFnbFloor, useFnbMenu } from './use-fnb';
import { fnbQueue, useFnbQueue } from './write-queue';
import { openOrderScreen, type OrderRouteParams } from './FnbFloorScreen';

// ----------------------------------------------------------------------
// Gọi món cho một đơn (bàn hoặc mang về).
//   - Tablet: thực đơn bên trái, đơn bên phải. Điện thoại: thực đơn + thanh đơn nổi, đơn mở bằng bảng trượt.
//   - Món chọn nằm trên máy cho tới khi "Gửi bar": đơn mới thì xếp lệnh mở đơn trước, rồi thêm món kèm gửi bar
//     (một phiếu cho lượt đó). Mỗi lượt gửi là một phiếu bar; đơn hiện theo lượt.
//   - Huỷ món đã gửi (bắt buộc lý do), chuyển món, tạm tính, thanh toán (PaymentPanel dùng chung), huỷ đơn: lệnh
//     có kiểm phiên bản chỉ dựng khi đơn đã đồng bộ xong; 409 → hàng đợi tải lại đơn, người dùng làm lại.
// ----------------------------------------------------------------------

const EMPTY: DraftLine[] = [];

type Panel = 'order' | 'pay' | 'void' | 'move' | 'cancel' | null;

export function FnbOrderScreen() {
  const params = useLocalSearchParams<OrderRouteParams>();
  const orderId = String(params.id ?? '');
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const isManager = isManagerUser(user);
  const { width, isTablet, isLandscape } = useResponsive();
  const split = isFnbSplit({ isTablet });
  const { branch } = useFnbAccess();
  const branchId = branch?.id;

  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  const menuQ = useFnbMenu(branchId);
  const { floor } = useFnbFloor(branchId, false);
  const order = useFnb((s) => s.orders[orderId]);
  const drafts = useFnb((s) => s.drafts[orderId] ?? EMPTY);
  const setDraft = useFnb((s) => s.setDraft);
  const applyOrders = useFnb((s) => s.applyOrders);
  const entries = useFnbQueue((s) => s.entries);

  const mine = useMemo(() => entriesOf(entries, orderId), [entries, orderId]);
  const unsyncedNew = isUnsyncedNew(entries, orderId);
  const outbox = useMemo(() => outboxLines(entries, orderId), [entries, orderId]);
  const attention = useMemo(() => mine.filter((e) => e.state === 'attention'), [mine]);
  const paying = mine.some((e) => e.kind === 'checkout' && e.state === 'queued');

  // Đơn đã có trên máy chủ: tải và hỏi lại mỗi 5 giây khi đang mở màn (đơn mới chưa gửi thì chưa có gì để tải).
  const orderQ = useQuery({
    queryKey: fnbKeys.order(orderId),
    queryFn: () => getFnbOrder(orderId),
    enabled: !!orderId && !unsyncedNew && (!!order || params.fresh !== '1'),
    refetchInterval: focused ? 5_000 : false,
    retry: false,
  });
  useEffect(() => {
    if (orderQ.data) applyOrders([orderQ.data]);
  }, [orderQ.data, applyOrders]);

  const table = findTable(floor, order?.tableId ?? params.tableId ?? null);
  const tableName = order?.tableName ?? params.tableName ?? table?.name ?? null;
  const title = tableName ?? t('fnb.takeaway');
  const subtitle = [order ? t('fnb.orderNo', { no: order.displayNo }) : null, order?.areaName ?? params.areaName ?? table?.areaName ?? null]
    .filter(Boolean)
    .join(' · ');

  const closed = !!order && order.status !== 'Open';
  const pending = pendingLines(order);
  const synced = canRunVersioned(order, entries);

  const [panel, setPanel] = useState<Panel>(null);
  const [optionsOf, setOptionsOf] = useState<IMenuDish | null>(null);
  const [openItem, setOpenItem] = useState(false);
  const [voidLine, setVoidLine] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentState | null>(null);

  // Thanh toán xong (đơn về Paid) → báo và quay lại sơ đồ bàn.
  const paidCode = order?.status === 'Paid' ? order.payment?.salesOrderCode : null;

  // ── Món đang chọn ──────────────────────────────────────────────────────

  const countOf = useCallback(
    (dishId: string) => drafts.filter((d) => d.dishId === dishId).reduce((s, d) => s + d.quantity, 0),
    [drafts]
  );

  function addLine(line: DraftLine) {
    if (closed) return;
    setDraft(orderId, addDraft(useFnb.getState().drafts[orderId] ?? EMPTY, line));
    haptics.light();
  }

  function pickDish(dish: IMenuDish) {
    if (dishNeedsOptions(menuQ.data, dish)) return setOptionsOf(dish);
    const v = defaultVariant(dish);
    if (v) addLine(itemDraft(dish, v));
  }

  // ── Lệnh ghi ───────────────────────────────────────────────────────────

  function needSynced(): boolean {
    if (synced) return true;
    toast.info(t('fnb.syncWait'));
    return false;
  }

  async function sendToBar() {
    if (!branchId || closed) return;
    const ctx = commandCtx();
    const current = useFnb.getState().drafts[orderId] ?? EMPTY;
    if (!order && !unsyncedNew) {
      await enqueueFnb(
        openOrderCmd(ctx, { orderId, branchId, tableId: params.tableId || null, allowSharedTable: params.shared === '1' })
      );
    }
    if (current.length) {
      setDraft(orderId, []);
      await enqueueFnb({ ...addLinesCmd(ctx, orderId, current.map(toLineInput), newId()), preview: { drafts: current } });
    }
    if (pending.length) await enqueueFnb(sendCmd(ctx, orderId, newId(), null));
    haptics.success();
    if (!split) setPanel(null);
  }

  async function removePending(line: IOrderLine) {
    if (await confirm({ title: t('fnb.removeLine'), message: line.name, destructive: true })) {
      await enqueueFnb(removePendingLineCmd(commandCtx(), orderId, line));
    }
  }

  async function discardAttention() {
    const restore = draftsToRestore(fnbQueue.store.getState().entries, orderId);
    await fnbQueue.discard(orderId);
    if (restore.length) setDraft(orderId, [...(useFnb.getState().drafts[orderId] ?? EMPTY), ...restore]);
    void orderQ.refetch();
  }

  async function printBill() {
    if (!order || !needSynced()) return;
    await enqueueFnb(billCmd(commandCtx(), order));
    toast.success(t('fnb.billQueued'));
  }

  function openPay() {
    if (!order || !needSynced()) return;
    if (drafts.length) return toast.info(t('fnb.sendDraftsFirst'));
    setPanel('pay');
  }

  async function checkout() {
    if (!order || !payment?.ready || !needSynced()) return;
    const total = order.totals.total;
    const plan = checkoutPlan(total, payment);
    await enqueueFnb(
      checkoutCmd(commandCtx(), order, { expectedTotal: total, payments: plan.payments, cashTendered: plan.cashTendered, sendPending: pending.length > 0 })
    );
    setPanel(null);
  }

  async function doVoid(input: { reason: string; alreadyMade: boolean; lines: { lineId: string; quantity: number }[] }) {
    if (!order || !needSynced()) return;
    await enqueueFnb(voidCmd(commandCtx(), order, input));
    setPanel(null);
  }

  async function doMove(target: MoveOption, lines: { lineId: string; quantity: number; newLineId: string | null }[], all: boolean) {
    if (!order || !needSynced()) return;
    const targetId = target.kind === 'existing' ? target.orderId : newId();
    await enqueueFnb(
      moveCmd(
        commandCtx(),
        order,
        target.kind === 'existing' ? { kind: 'existing', orderId: targetId } : { kind: 'create', orderId: targetId, tableId: target.tableId },
        lines
      )
    );
    setPanel(null);
    // Chuyển hết (đổi bàn / gộp) → sang đơn đích.
    if (all) openOrderScreen({ id: targetId }, true);
  }

  async function doCancel(input: { reason: string | null; alreadyMade: boolean }) {
    if (!order || !needSynced()) return;
    await enqueueFnb(cancelCmd(commandCtx(), order, { hasSentLines: voidableLines(order).length > 0, ...input }));
    setPanel(null);
    goBackOrHome();
  }

  function moreActions() {
    if (!order) return;
    void showActionSheet({
      options: [
        { label: t('fnb.voidItems'), icon: 'close-circle-outline', onPress: () => needSynced() && (setVoidLine(null), setPanel('void')) },
        { label: t('fnb.moveItems'), icon: 'swap-horizontal', onPress: () => needSynced() && setPanel('move') },
        { label: t('fnb.cancelOrder'), icon: 'delete-outline', destructive: true, onPress: () => needSynced() && setPanel('cancel') },
      ],
    });
  }

  // ── Khung đơn ──────────────────────────────────────────────────────────

  const nDraft = draftCount(drafts);
  const canSend = !closed && (drafts.length > 0 || pending.length > 0);
  const total = (order?.totals.total ?? 0) + draftTotal(drafts);
  const hasSentLines = voidableLines(order).length > 0;

  const orderBody = (
    <OrderPanel
      order={order}
      drafts={drafts}
      outbox={outbox}
      attention={attention}
      onDraftQty={(id, n) => setDraft(orderId, setDraftQty(drafts, id, n))}
      onRemovePending={removePending}
      onVoidLine={(l) => {
        if (!needSynced()) return;
        setVoidLine(l.id);
        setPanel('void');
      }}
      onDiscardAttention={discardAttention}
    />
  );

  const orderFooter = closed ? null : (
    <View className="gap-2">
      <Button icon="glass-cocktail" disabled={!canSend} onPress={sendToBar}>
        {nDraft ? t('fnb.sendBarN', { n: nDraft }) : t('fnb.sendBar')}
      </Button>
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button variant="soft" icon="receipt" disabled={!order || order.totals.itemCount === 0} onPress={printBill}>{t('fnb.bill')}</Button>
        </View>
        <View className="flex-1">
          <Button variant="soft" icon="cash-register" loading={paying} disabled={!order || order.totals.itemCount === 0} onPress={openPay}>
            {t('fnb.pay')}
          </Button>
        </View>
        <Pressable
          disabled={!order}
          onPress={moreActions}
          accessibilityLabel={t('fnb.more')}
          className="w-12 h-12 rounded-[10px] items-center justify-center bg-ink/10 dark:bg-white/10"
        >
          <Icon name="dots-horizontal" size={22} tone={order ? 'default' : 'faint'} />
        </Pressable>
      </View>
    </View>
  );

  const closedNote = closed ? (
    <View className="rounded-2xl bg-ink/5 dark:bg-white/10 px-4 py-3 gap-2">
      <Text variant="bodySmall" className="font-semibold">
        {order?.status === 'Paid'
          ? t('fnb.paidNote', { code: paidCode ?? '' })
          : order?.status === 'Moved'
            ? t('fnb.movedNote')
            : t('fnb.closedNote')}
      </Text>
      {order?.status === 'Paid' && order.payment && order.payment.changeDue > 0 ? (
        <Text variant="bodySmall" tone="success" className="font-semibold">{t('fnb.changeDue', { amount: money(order.payment.changeDue) })}</Text>
      ) : null}
      <View className="flex-row gap-2">
        {order?.status === 'Moved' && order.movedToOrderId ? (
          <View className="flex-1">
            <Button variant="soft" icon="arrow-right" onPress={() => openOrderScreen({ id: order.movedToOrderId! }, true)}>
              {t('fnb.openTarget')}
            </Button>
          </View>
        ) : null}
        <View className="flex-1">
          <Button icon="table-furniture" onPress={goBackOrHome}>{t('fnb.backToFloor')}</Button>
        </View>
      </View>
    </View>
  ) : null;

  const menu = (
    <MenuPanel
      menu={menuQ.data}
      loading={menuQ.isLoading}
      error={menuQ.isError}
      countOf={countOf}
      onPick={pickDish}
      onOptions={setOptionsOf}
      onOpenItem={() => setOpenItem(true)}
      bottomInset={split ? Math.max(insets.bottom, 12) + 16 : insets.bottom + 96}
      header={<AppHeader back title={title} subtitle={subtitle || undefined} />}
    />
  );

  return (
    <View
      className={split ? 'flex-1 flex-row bg-bg dark:bg-bg-dark' : 'flex-1 bg-bg dark:bg-bg-dark'}
      style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}
    >
      {closed && !split ? (
        <View className="flex-1 px-4 gap-3">
          <AppHeader back title={title} subtitle={subtitle || undefined} />
          {closedNote}
          <ScrollView className="flex-1">{orderBody}</ScrollView>
        </View>
      ) : (
        <View className="flex-1">{menu}</View>
      )}

      {split ? (
        <View style={{ width: orderPaneWidth(width, isLandscape) }} className="border-l border-line/70 dark:border-line-dark bg-surface dark:bg-surface-dark">
          <View className="px-5 pt-3 pb-1 flex-row items-center gap-2">
            <Text variant="title2" numberOfLines={1} className="flex-1">{title}</Text>
            {order ? <Text variant="bodySmall" tone="muted">{t('fnb.orderNo', { no: order.displayNo })}</Text> : null}
          </View>
          <ScrollView className="flex-1" contentContainerClassName="px-5 py-2 gap-3" keyboardShouldPersistTaps="handled">
            {closedNote}
            {orderBody}
          </ScrollView>
          {orderFooter ? (
            <View className="px-5 pt-2 border-t border-line/70 dark:border-line-dark" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
              {orderFooter}
            </View>
          ) : null}
        </View>
      ) : closed ? null : (
        <View style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 8) + 8 }}>
          <Pressable onPress={() => setPanel('order')} className="flex-row items-center gap-3 rounded-2xl bg-primary px-4 h-14" style={softShadow}>
            <View className="w-8 h-8 rounded-full items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.22)' }}>
              <Text tone="inverse" className="font-bold">{(order?.totals.itemCount ?? 0) + nDraft}</Text>
            </View>
            <Text tone="inverse" className="flex-1 font-bold text-[17px]" style={{ fontVariant: ['tabular-nums'] }}>{money(total)}</Text>
            {nDraft ? <Icon name="glass-cocktail" size={18} color="#FFFFFF" /> : null}
            <Text tone="inverse" className="font-bold">{t('fnb.viewOrder')}</Text>
            <Icon name="chevron-up" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      )}

      {!split ? (
        <Sheet visible={panel === 'order'} title={`${title}${order ? ` · #${order.displayNo}` : ''}`} onClose={() => setPanel(null)} footer={orderFooter}>
          {orderBody}
        </Sheet>
      ) : null}

      <Sheet
        visible={panel === 'pay' && !!order}
        title={t('fnb.pay')}
        onClose={() => setPanel(null)}
        footer={
          <Button icon="check" disabled={!payment?.ready} onPress={checkout}>
            {t('erp.complete')}
          </Button>
        }
      >
        {order ? <PaymentPanel total={order.totals.total} transferRef={`${tableName ?? t('fnb.takeaway')} ${order.displayNo}`} onChange={setPayment} /> : null}
      </Sheet>

      <VoidSheet
        order={order}
        focusLineId={voidLine}
        visible={panel === 'void'}
        blockedByRole={!!order?.voidRequiresManager && !isManager}
        onClose={() => setPanel(null)}
        onConfirm={doVoid}
      />
      <MoveSheet order={order} floor={floor} visible={panel === 'move'} onClose={() => setPanel(null)} onConfirm={doMove} />
      <CancelOrderSheet
        visible={panel === 'cancel'}
        hasSentLines={hasSentLines}
        blockedByRole={hasSentLines && !!order?.voidRequiresManager && !isManager}
        onClose={() => setPanel(null)}
        onConfirm={doCancel}
      />
      <DishOptionsSheet
        menu={menuQ.data}
        dish={optionsOf}
        onClose={() => setOptionsOf(null)}
        onAdd={(line) => {
          addLine(line);
          setOptionsOf(null);
        }}
      />
      <OpenItemSheet
        visible={openItem}
        onClose={() => setOpenItem(false)}
        onAdd={(line) => {
          addLine(line);
          setOpenItem(false);
        }}
      />
    </View>
  );
}
