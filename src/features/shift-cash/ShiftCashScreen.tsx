import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, EmptyState, Loading } from 'src/components/shared';
import { Text, Button, Badge, Card, Icon, Pressable, Divider, TextField, CountUp } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';
import { ADMIN_ROLES, hasAnyRole } from 'src/auth/roles';
import { canOverseeShiftCash, canManageShiftCashOversight, canViewShiftCashRevenue } from 'src/auth/permissions';
import { extractApiError } from 'src/services/error';
import {
  openCounter,
  addShiftCashTransaction,
  updateShiftCashTransaction,
  deleteShiftCashTransaction,
  updateDenominationBatch,
  finalizeShiftCash,
} from 'src/api/shiftCash';

import { useShiftCash } from './hooks';
import { useShiftCashAccess } from './AccessGate';
import { TransactionSheet, type TxDraft } from './TransactionSheet';
import { ReconcileSheet } from './ReconcileSheet';
import { DENOMINATIONS, formatCurrency, computeTotalCash, vnToday } from './utils';
import type { IShiftCashTransaction, IShiftCashFinalization, IShiftCashRevenue } from 'src/types/corecms-api';
import { useResponsive } from 'src/hooks/use-responsive';

// ── Lịch sử chốt ────────────────────────────────────────────────────────────
// Hiển thị từng lần chốt: trước/sau chốt, chênh tiền mặt, và chênh tiền tổng
// (thừa/thiếu/khớp) — đối chiếu giống bảng "Lịch sử chốt" bên core-fe.
function FinalizationLog({ items }: { items: IShiftCashFinalization[] }) {
  // BE trả mới nhất trước; "lần chốt cuối" là phần tử đầu.
  return (
    <View className="gap-2 mt-1">
      <Text variant="caption" tone="muted" className="font-semibold">
        Lịch sử chốt ({items.length} lần)
      </Text>
      {items.map((f, idx) => {
        const cashDiff = f.closingBalance - f.openingBalance;
        const totalDiff = f.difference ?? 0;
        const isLast = idx === 0;
        return (
          <View
            key={f.id}
            className={cn(
              'rounded-2xl px-3.5 py-2.5 border',
              isLast ? 'bg-success-soft border-success/30' : 'bg-bg dark:bg-surface-dark border-line/50 dark:border-line-dark/50',
            )}
          >
            {/* Dòng tiêu đề: thời điểm + người chốt */}
            <View className="flex-row items-center gap-1.5">
              <Icon name="check-circle" size={16} tone={isLast ? 'success' : 'faint'} />
              <Text variant="caption" tone={isLast ? 'success' : 'muted'} className="flex-1" numberOfLines={1}>
                {isLast ? 'Lần chốt cuối: ' : ''}
                {f.finalizedAt ? dayjs(f.finalizedAt).format('HH:mm DD-MM') : ''}
                {f.finalizedByName ? ` bởi ${f.finalizedByName}` : ''}
              </Text>
            </View>

            {/* Trước chốt → Sau chốt + chênh tiền mặt */}
            <View className="flex-row items-center justify-between mt-1.5 pl-[22px]">
              <View className="items-center flex-1">
                <Text variant="caption" tone="faint">Trước chốt</Text>
                <Text variant="caption" className="font-medium" style={{ fontVariant: ['tabular-nums'] }}>{formatCurrency(f.openingBalance)}</Text>
              </View>
              <Icon name="arrow-right" size={14} tone="faint" />
              <View className="items-center flex-1">
                <Text variant="caption" tone="faint">Sau chốt</Text>
                <Text variant="caption" tone={isLast ? 'primary' : 'default'} className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>{formatCurrency(f.closingBalance)}</Text>
              </View>
              <View className="items-center flex-1">
                <Text variant="caption" tone="faint">Chênh tiền mặt</Text>
                <Text variant="caption" tone={cashDiff >= 0 ? 'success' : 'error'} className="font-semibold" style={{ fontVariant: ['tabular-nums'] }}>
                  {cashDiff >= 0 ? '+' : ''}{formatCurrency(cashDiff)}
                </Text>
              </View>
            </View>

            {/* Chênh tiền tổng */}
            <View className="flex-row items-center justify-between mt-2 pt-2 pl-[22px] border-t border-dashed border-line dark:border-line-dark">
              <View className="flex-row items-center gap-1">
                <Icon name={totalDiff === 0 ? 'check-circle' : 'alert'} size={13} tone={totalDiff === 0 ? 'success' : 'warning'} />
                <Text variant="caption" tone="muted">Chênh tiền tổng</Text>
              </View>
              <Text
                variant="caption"
                className="font-bold"
                tone={totalDiff === 0 ? 'success' : totalDiff > 0 ? 'warning' : 'error'}
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {totalDiff === 0
                  ? 'Khớp'
                  : `${totalDiff > 0 ? '+' : ''}${formatCurrency(totalDiff)} (${totalDiff > 0 ? 'thừa' : 'thiếu'})`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Summary row helper ─────────────────────────────────────────────────────────
function SummaryRow({
  label,
  value,
  tone = 'default',
  indent,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'muted' | 'success' | 'error' | 'primary';
  indent?: boolean;
}) {
  return (
    <View className={cn('flex-row items-center justify-between', indent && 'pl-3')}>
      <Text variant="bodySmall" tone={indent ? 'faint' : 'muted'}>{label}</Text>
      <Text
        variant="bodySmall"
        tone={tone === 'default' ? 'default' : tone}
        className="font-semibold"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}

// ── Doanh thu (dữ liệu hệ thống) ────────────────────────────────────────────────
// Không có quyền xem doanh thu → BE không gửi con số nào ({ masked: true }) → "****". Cuối ngày quản lý xem chủ yếu
// dòng chuyển khoản: số trên hoá đơn so với tiền ngân hàng thực nhận (khi cửa hàng có theo dõi ngân hàng).
const MASKED = '****';

function RevenueBlock({ revenue, loading }: { revenue: IShiftCashRevenue | null; loading: boolean }) {
  const data = revenue && revenue.masked !== true ? revenue : null;
  const sales = data?.revenue.sales;
  const bank = data?.bank;
  const bankIssue = !!bank?.hasBankFeed && (bank.missingCredits.length > 0 || bank.unmatchedCredits.length > 0);

  return (
    <View className="gap-1.5 rounded-2xl px-3.5 py-3 border border-dashed border-line dark:border-line-dark">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-1.5 flex-1">
          <Icon name="chart-line" size={16} tone="muted" />
          <Text variant="subtitle">Doanh thu</Text>
          {sales ? <Text variant="caption" tone="faint">{sales.invoiceCount} hoá đơn</Text> : null}
        </View>
        <Text variant="subtitle" tone={data ? 'default' : 'faint'} style={{ fontVariant: ['tabular-nums'] }}>
          {data ? `${formatCurrency(sales!.netRevenue)}đ` : revenue?.masked ? MASKED : loading ? '…' : '—'}
        </Text>
      </View>
      {sales && bank ? (
        <>
          <SummaryRow label="Tiền mặt" value={`${formatCurrency(sales.cash)}đ`} indent />
          <SummaryRow label="Chuyển khoản" value={`${formatCurrency(sales.transfer)}đ`} indent />
          {bank.hasBankFeed && (sales.transfer > 0 || bank.received > 0) ? (
            <SummaryRow
              label="  Ngân hàng nhận"
              value={`${formatCurrency(bank.received)}đ${Math.abs(bank.difference) >= 1 ? ` (${bank.difference > 0 ? '+' : '−'}${formatCurrency(Math.abs(bank.difference))})` : ''}`}
              tone={bankIssue ? 'error' : 'success'}
              indent
            />
          ) : null}
          <SummaryRow label="Quẹt thẻ" value={`${formatCurrency(sales.card)}đ`} indent />
          {sales.eWallet !== 0 ? <SummaryRow label="Ví điện tử" value={`${formatCurrency(sales.eWallet)}đ`} indent /> : null}
          {sales.other !== 0 ? <SummaryRow label="Khác (voucher, điểm…)" value={`${formatCurrency(sales.other)}đ`} indent /> : null}
          {sales.returns !== 0 ? <SummaryRow label="Trả hàng" value={`−${formatCurrency(sales.returns)}đ`} tone="error" indent /> : null}
          {bankIssue ? (
            <Text variant="caption" tone="warning">
              {[
                bank.missingCredits.length > 0 ? `${bank.missingCredits.length} hoá đơn chuyển khoản chưa thấy tiền về` : null,
                bank.unmatchedCredits.length > 0 ? `${bank.unmatchedCredits.length} khoản tiền về chưa khớp hoá đơn` : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {!bank.hasBankFeed && sales.transfer > 0 ? (
            <Text variant="caption" tone="faint">Chưa theo dõi tiền vào ngân hàng nên chưa đối chiếu được chuyển khoản.</Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

export function ShiftCashScreen() {
  const { isTablet, isLandscape, width } = useResponsive();
  const wide = (isTablet && isLandscape) || width >= 900;
  const { user } = useAuthContext();
  // Cùng luật với BE RequireShiftCashAccess: quyền sửa giám sát mới ghi ngày cũ / khoản của người khác. Người chỉ có
  // quyền xem vào thẳng (không qua kiểm ca) nên chỉ xem — ghi sẽ bị BE chặn vì không có ca.
  const canManageOversight = canManageShiftCashOversight(user);
  const canOversee = canOverseeShiftCash(user);
  const viewOnly = canOversee && !canManageOversight;
  // Xem doanh thu + kiểm tra chênh lệch (bấm dòng "Chênh lệch") — mặc định Chủ + Quản lý.
  const canViewRevenue = canViewShiftCashRevenue(user);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  // Toạ độ đã xác minh ở cổng — gửi kèm MỌI lệnh (header X-Geo-* cho BE gác cổng + body để lưu audit).
  // todayOnly: không phải người giám sát thì chỉ ngày hôm nay (BE cũng chặn ngày khác bằng 403).
  const { geo, todayOnly, handleDenied } = useShiftCashAccess();
  const geoStamp = geo ?? {};

  const [pickedDate, setDate] = useState(vnToday());
  // Ghim hôm nay theo giờ VN (để màn mở qua nửa đêm cũng chuyển sang ngày mới).
  const date = todayOnly ? vnToday() : pickedDate;
  const isToday = date === vnToday();
  const canEdit = canManageOversight || (isToday && !viewOnly);
  const isOwner = hasAnyRole(user, ADMIN_ROLES);

  const { summary, revenue, loading, revenueLoading, refreshing, refetch, denied } = useShiftCash(date, geo);

  // BE từ chối (hết ca / ra ngoài cửa hàng / ngày cũ) → về cổng hiện lý do.
  useEffect(() => {
    if (denied) handleDenied(denied);
  }, [denied, handleDenied]);

  // ── Denomination editing ──────────────────────────────────────────────────
  const [denomQ, setDenomQ] = useState<Record<number, number>>({});
  const [denomEditing, setDenomEditing] = useState(false);
  const [savingDenom, setSavingDenom] = useState(false);

  // Đồng bộ số lượng từ server khi KHÔNG ở chế độ sửa (tránh ghi đè khi đang nhập).
  useEffect(() => {
    if (!summary || denomEditing) return;
    const m: Record<number, number> = {};
    DENOMINATIONS.forEach((d) => {
      m[d] = summary.denominations.find((x) => x.denomination === d)?.quantity ?? 0;
    });
    setDenomQ(m);
  }, [summary, denomEditing]);

  const hasOpened = (summary?.denominations?.length ?? 0) > 0;
  const totalCash = useMemo(() => computeTotalCash(denomQ), [denomQ]);
  const expectedClosing = summary?.expectedClosing ?? 0;
  const difference = totalCash - expectedClosing;

  // ── Transaction sheet ─────────────────────────────────────────────────────
  const [tx, setTx] = useState<{ visible: boolean; mode: 'add' | 'edit'; type: 'Thu' | 'Chi'; editing: IShiftCashTransaction | null }>(
    { visible: false, mode: 'add', type: 'Thu', editing: null }
  );
  const [txSaving, setTxSaving] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function shiftDay(delta: number) {
    if (todayOnly) return;
    setDenomEditing(false);
    setDate((d) => dayjs(d).add(delta, 'day').format('YYYY-MM-DD'));
  }

  async function handleOpenCounter() {
    try {
      await openCounter(date, geo);
      await refetch();
    } catch (err) {
      if (handleDenied(err)) return;
      toast.error(extractApiError(err), 'Mở quầy thất bại');
    }
  }

  async function persistDenominations(finalize: boolean) {
    setSavingDenom(true);
    try {
      const items = DENOMINATIONS.map((d) => ({ denomination: d, quantity: denomQ[d] || 0 }));
      if (finalize) {
        await finalizeShiftCash({ date, items, ...geoStamp }, geo);
      } else {
        await updateDenominationBatch({ date, items, ...geoStamp }, geo);
      }
      setDenomEditing(false);
      await refetch();
      haptics.success();
      toast.success(finalize ? 'Kết quả kiểm đếm đã được chốt.' : 'Đã lưu số lượng mệnh giá.', finalize ? 'Đã chốt tiền' : 'Đã lưu');
    } catch (err) {
      if (handleDenied(err)) return;
      haptics.error();
      toast.error(extractApiError(err), finalize ? 'Chốt tiền thất bại' : 'Lưu thất bại');
    } finally {
      setSavingDenom(false);
    }
  }

  async function confirmFinalize() {
    const ok = await confirm({
      title: 'Chốt tiền cuối ca',
      message: `Tiền mặt kiểm đếm: ${formatCurrency(totalCash)}đ\nTồn cuối dự kiến: ${formatCurrency(expectedClosing)}đ\nChênh lệch: ${difference >= 0 ? '+' : ''}${formatCurrency(difference)}đ\n\nXác nhận chốt ca?`,
      confirmText: 'Chốt ca',
    });
    if (ok) persistDenominations(true);
  }

  async function handleSubmitTx(draft: TxDraft) {
    setTxSaving(true);
    try {
      if (tx.mode === 'add') {
        await addShiftCashTransaction({ date, type: draft.type, amount: draft.amount, note: draft.note, ...geoStamp }, geo);
      } else if (tx.editing) {
        await updateShiftCashTransaction(tx.editing.id, { amount: draft.amount, note: draft.note, ...geoStamp }, geo);
      }
      setTx((s) => ({ ...s, visible: false, editing: null }));
      await refetch();
    } catch (err) {
      if (handleDenied(err)) return;
      toast.error(extractApiError(err), 'Lưu thất bại');
    } finally {
      setTxSaving(false);
    }
  }

  async function confirmDeleteTx(t: IShiftCashTransaction) {
    const ok = await confirm({
      title: 'Xoá khoản này?',
      message: `${t.type} ${formatCurrency(t.amount)}đ${t.note ? ` — ${t.note}` : ''}`,
      confirmText: 'Xoá',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteShiftCashTransaction(t.id, geo);
      await refetch();
    } catch (err) {
      if (handleDenied(err)) return;
      toast.error(extractApiError(err), 'Xoá thất bại');
    }
  }

  // Các khối của màn — màn dọc xếp một cột, tablet / POS màn ngang chia hai cột.

  // Tổng hợp
  const summaryCard = (
      <SectionCard title="Tổng hợp" icon="calculator-variant-outline">
        <View className="gap-2">
          <SummaryRow label="Tồn đầu ca" value={`${formatCurrency(summary?.openingBalance ?? 0)}đ`} />
          <SummaryRow label="+ Tiền mặt bán hàng" value={`${formatCurrency(summary?.totalCashFromKiot ?? 0)}đ`} />
          <SummaryRow label="+ Thu quầy" value={`+${formatCurrency(summary?.manualIncome ?? 0)}đ`} tone="success" />
          <SummaryRow label="- Chi quầy" value={`-${formatCurrency(summary?.manualExpense ?? 0)}đ`} tone="error" />

          <Divider className="my-1" />
          <View className="flex-row items-center justify-between">
            <Text variant="subtitle">= Tồn cuối dự kiến</Text>
            <Text variant="subtitle" tone="primary" style={{ fontVariant: ['tabular-nums'] }}>
              {formatCurrency(expectedClosing)}đ
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text variant="bodySmall" tone="muted">Tiền mặt kiểm đếm</Text>
            <Text variant="subtitle" style={{ fontVariant: ['tabular-nums'] }}>{formatCurrency(totalCash)}đ</Text>
          </View>

          {/* Difference — người được xem doanh thu bấm để kiểm tra chênh lệch (két, chuyển khoản, KiotViet). */}
          <Pressable
            disabled={!canViewRevenue}
            onPress={() => setReconcileOpen(true)}
            accessibilityRole={canViewRevenue ? 'button' : undefined}
            accessibilityHint={canViewRevenue ? 'Mở kiểm tra chênh lệch' : undefined}
            className={cn('mt-1 rounded-2xl px-4 py-3', difference >= 0 ? 'bg-success-soft' : 'bg-error-soft')}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <Icon name={difference === 0 ? 'check-circle' : 'scale-balance'} size={18} tone={difference >= 0 ? 'success' : 'error'} />
                <Text variant="subtitle" tone={difference >= 0 ? 'success' : 'error'}>Chênh lệch</Text>
              </View>
              <CountUp
                variant="title2"
                tone={difference >= 0 ? 'success' : 'error'}
                style={{ fontVariant: ['tabular-nums'] }}
                value={difference}
                format={(n) => `${n >= 0 ? '+' : ''}${formatCurrency(Math.round(n))}đ`}
              />
            </View>
            {canViewRevenue ? (
              <View className="flex-row items-center justify-end gap-0.5 mt-1">
                <Text variant="caption" tone={difference >= 0 ? 'success' : 'error'} className="font-semibold">Kiểm tra chênh lệch</Text>
                <Icon name="chevron-right" size={16} tone={difference >= 0 ? 'success' : 'error'} />
              </View>
            ) : null}
          </Pressable>
          <RevenueBlock revenue={revenue} loading={revenueLoading} />
          {summary?.finalizations && summary.finalizations.length > 0 ? (
            <FinalizationLog items={summary.finalizations} />
          ) : null}
        </View>
      </SectionCard>
  );

  // Mệnh giá (đếm tiền, chốt ca)
  const denomCard = (
      <SectionCard
        title="Tiền mặt trong quầy"
        icon="cash-multiple"
        right={
          !hasOpened ? (
            <Button size="sm" icon="store" fullWidth={false} disabled={!canEdit} onPress={handleOpenCounter}>
              Mở quầy
            </Button>
          ) : !denomEditing ? (
            <Button size="sm" variant="outline" action="primary" icon="lock-open-variant-outline" fullWidth={false} disabled={!canEdit} onPress={() => setDenomEditing(true)}>
              Chốt tiền
            </Button>
          ) : undefined
        }
      >
        {!hasOpened ? (
          <EmptyState icon="store-outline" title="Quầy chưa mở hôm nay" description={canEdit ? 'Nhấn "Mở quầy" để bắt đầu ca mới.' : 'Chưa có dữ liệu mệnh giá.'} />
        ) : (
          <View className="gap-0.5">
            {/* Header */}
            <View className="flex-row items-center pb-1.5">
              <Text variant="caption" tone="faint" className="flex-1">Mệnh giá</Text>
              <Text variant="caption" tone="faint" className="w-20 text-center">Số tờ</Text>
              <Text variant="caption" tone="faint" className="w-28 text-right">Thành tiền</Text>
            </View>
            {DENOMINATIONS.map((d) => {
              const qty = denomQ[d] || 0;
              return (
                <View key={d} className="flex-row items-center py-1.5 border-t border-line/40 dark:border-line-dark/40">
                  <Text variant="bodySmall" className="flex-1 font-semibold">{formatCurrency(d * 1000)}đ</Text>
                  <View className="w-20 items-center">
                    {denomEditing ? (
                      <TextField
                        keyboardType="number-pad"
                        value={qty ? String(qty) : ''}
                        placeholder="0"
                        onChangeText={(v) => setDenomQ((p) => ({ ...p, [d]: parseInt(v.replace(/\D/g, ''), 10) || 0 }))}
                        containerClassName="w-[68px]"
                        className="text-center"
                      />
                    ) : (
                      <Text variant="bodySmall" tone={qty ? 'default' : 'faint'} style={{ fontVariant: ['tabular-nums'] }}>{qty}</Text>
                    )}
                  </View>
                  <Text variant="bodySmall" tone={qty ? 'default' : 'faint'} className="w-28 text-right" style={{ fontVariant: ['tabular-nums'] }}>
                    {formatCurrency(d * 1000 * qty)}
                  </Text>
                </View>
              );
            })}
            <View className="flex-row items-center pt-2 mt-1 border-t-2 border-line/60 dark:border-line-dark/60">
              <Text variant="subtitle" className="flex-1">Tổng tiền mặt</Text>
              <CountUp variant="subtitle" tone="primary" style={{ fontVariant: ['tabular-nums'] }} value={totalCash} format={(n) => `${formatCurrency(Math.round(n))}đ`} />
            </View>

            {denomEditing ? (
              <View className="flex-row gap-2 mt-3">
                <View className="flex-1">
                  <Button size="sm" variant="soft" action="neutral" onPress={() => setDenomEditing(false)}>Huỷ</Button>
                </View>
                <View className="flex-1">
                  <Button size="sm" variant="soft" icon="content-save-outline" loading={savingDenom} onPress={() => persistDenominations(false)}>Lưu tạm</Button>
                </View>
                <View className="flex-1">
                  <Button size="sm" action="primary" icon="check-circle-outline" loading={savingDenom} onPress={confirmFinalize}>Chốt ca</Button>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </SectionCard>
  );

  // Thu chi quầy
  const txCard = (
      <SectionCard title="Thu chi quầy" icon="cash-sync" count={summary?.transactions?.length ?? 0}>
        <View className="flex-row gap-2 mb-1">
          <View className="flex-1">
            <Button size="sm" action="primary" variant="soft" icon="plus" disabled={!canEdit} onPress={() => setTx({ visible: true, mode: 'add', type: 'Thu', editing: null })}>Thêm thu</Button>
          </View>
          <View className="flex-1">
            <Button size="sm" action="error" variant="soft" icon="plus" disabled={!canEdit} onPress={() => setTx({ visible: true, mode: 'add', type: 'Chi', editing: null })}>Thêm chi</Button>
          </View>
        </View>

        {(summary?.transactions?.length ?? 0) === 0 ? (
          <EmptyState icon="cash-remove" title="Chưa có thu chi nào" />
        ) : (
          summary!.transactions.map((t, i) => (
            <View key={t.id}>
              {i > 0 ? <Divider className="my-1" /> : null}
              <View className="flex-row items-center gap-3 py-1.5">
                <Badge tone={t.type === 'Thu' ? 'success' : 'error'}>{t.type}</Badge>
                <View className="flex-1">
                  <Text variant="bodySmall" tone={t.type === 'Thu' ? 'success' : 'error'} className="font-bold" style={{ fontVariant: ['tabular-nums'] }}>
                    {t.type === 'Thu' ? '+' : '-'}{formatCurrency(t.amount)}đ
                  </Text>
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {t.note || '—'}{t.createdByName ? `  ·  ${t.createdByName}` : ''}
                  </Text>
                </View>
                {/* Khoản gắn cổ đông vào chốt sổ cổ đông — chỉ chủ cửa hàng sửa / xoá (BE Till.ShareholderOwnerOnly). */}
                {canEdit && (isOwner || !t.shareholderId) ? (
                  <View className="flex-row">
                    <Pressable onPress={() => setTx({ visible: true, mode: 'edit', type: t.type, editing: t })} className="w-9 h-9 items-center justify-center">
                      <Icon name="pencil-outline" size={18} tone="muted" />
                    </Pressable>
                    <Pressable onPress={() => confirmDeleteTx(t)} className="w-9 h-9 items-center justify-center">
                      <Icon name="trash-can-outline" size={18} tone="error" />
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}
      </SectionCard>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Screen scroll tabBarInset={false} refreshing={refreshing} onRefresh={refetch}>
      <AppHeader
        title="Kiểm tiền quầy"
        subtitle="Đối soát tiền mặt cuối ca"
        back
        actions={[{ icon: 'refresh', onPress: refetch }]}
      />

      {/* Date nav — chỉ người giám sát Kiểm quầy được lùi xem ngày cũ; Staff/Manager ghim hôm nay. */}
      <Card className="p-2.5">
        {todayOnly ? (
          <View className="items-center py-1">
            <Text variant="subtitle">{dayjs(date).format('dddd')}</Text>
            <Text variant="bodySmall" tone="muted">{dayjs(date).format('DD/MM/YYYY')}  ·  Hôm nay</Text>
          </View>
        ) : (
          <>
            <View className="flex-row items-center justify-between">
              <Pressable onPress={() => shiftDay(-1)} className="w-10 h-10 items-center justify-center rounded-full bg-bg dark:bg-surface-dark">
                <Icon name="chevron-left" size={22} tone="default" />
              </Pressable>
              <View className="items-center">
                <Text variant="subtitle">{dayjs(date).format('dddd')}</Text>
                <Text variant="bodySmall" tone="muted">{dayjs(date).format('DD/MM/YYYY')}{isToday ? '  ·  Hôm nay' : ''}</Text>
              </View>
              <Pressable
                onPress={() => shiftDay(1)}
                disabled={isToday}
                className={cn('w-10 h-10 items-center justify-center rounded-full bg-bg dark:bg-surface-dark', isToday && 'opacity-30')}
              >
                <Icon name="chevron-right" size={22} tone="default" />
              </Pressable>
            </View>
            {!isToday ? (
              <Pressable onPress={() => { setDenomEditing(false); setDate(vnToday()); }} className="mt-2 self-center">
                <Badge tone="secondary" icon="calendar-today">Về hôm nay</Badge>
              </Pressable>
            ) : null}
          </>
        )}
      </Card>

      {loading && !summary ? (
        <Loading />
      ) : (
        wide ? (
          <View className="flex-row gap-3.5 items-start">
            <View className="flex-1 gap-3.5">
              {summaryCard}
            </View>
            <View className="flex-1 gap-3.5">
              {denomCard}
              {txCard}
            </View>
          </View>
        ) : (
          <>
            {summaryCard}
            {denomCard}
            {txCard}
          </>
        )
      )}

      <TransactionSheet
        visible={tx.visible}
        mode={tx.mode}
        type={tx.type}
        editing={tx.editing}
        saving={txSaving}
        onClose={() => setTx((s) => ({ ...s, visible: false, editing: null }))}
        onSubmit={handleSubmitTx}
      />
      <ReconcileSheet
        visible={reconcileOpen}
        date={date}
        geo={geo}
        canOversee={canOversee}
        onClose={() => setReconcileOpen(false)}
      />
    </Screen>
  );
}
