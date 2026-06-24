import { useEffect, useMemo, useState } from 'react';
import { View, Alert } from 'react-native';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard, EmptyState, Loading } from 'src/components/shared';
import { Text, Button, Badge, Card, Icon, Pressable, Divider, TextField } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { useAuthContext } from 'src/auth/auth-context';
import { getUserRoles } from 'src/auth/roles';
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
import { useShiftCashGps } from './GpsGate';
import { TransactionSheet, type TxDraft } from './TransactionSheet';
import { DENOMINATIONS, formatCurrency, computeTotalCash, vnToday } from './utils';
import type { IShiftCashTransaction } from 'src/types/corecms-api';

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

export function ShiftCashScreen() {
  const { user } = useAuthContext();
  const isAdmin = getUserRoles(user).includes('Admin');

  // Toạ độ đã xác minh ở cổng GPS — gửi kèm mọi thao tác ghi để lưu vào audit (BE).
  const geo = useShiftCashGps();
  const geoStamp = geo ?? {};

  const [date, setDate] = useState(vnToday());
  const isToday = date === vnToday();
  const canEdit = isToday || isAdmin;

  const { summary, kiot, loading, kiotLoading, kiotError, refreshing, refetch } = useShiftCash(date);

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
  const kiotNet = (kiot?.totalRevenue ?? 0) - (kiot?.totalReturns ?? 0);

  // ── Transaction sheet ─────────────────────────────────────────────────────
  const [tx, setTx] = useState<{ visible: boolean; mode: 'add' | 'edit'; type: 'Thu' | 'Chi'; editing: IShiftCashTransaction | null }>(
    { visible: false, mode: 'add', type: 'Thu', editing: null }
  );
  const [txSaving, setTxSaving] = useState(false);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function shiftDay(delta: number) {
    setDenomEditing(false);
    setDate((d) => dayjs(d).add(delta, 'day').format('YYYY-MM-DD'));
  }

  async function handleOpenCounter() {
    try {
      await openCounter(date, geo ?? undefined);
      await refetch();
    } catch (err) {
      Alert.alert('Mở quầy thất bại', extractApiError(err));
    }
  }

  async function persistDenominations(finalize: boolean) {
    setSavingDenom(true);
    try {
      const items = DENOMINATIONS.map((d) => ({ denomination: d, quantity: denomQ[d] || 0 }));
      if (finalize) {
        await finalizeShiftCash({ date, items, ...geoStamp });
      } else {
        await updateDenominationBatch({ date, items, ...geoStamp });
      }
      setDenomEditing(false);
      await refetch();
      Alert.alert('✅ ' + (finalize ? 'Đã chốt tiền' : 'Đã lưu'), finalize ? 'Kết quả kiểm đếm đã được chốt.' : 'Đã lưu số lượng mệnh giá.');
    } catch (err) {
      Alert.alert(finalize ? 'Chốt tiền thất bại' : 'Lưu thất bại', extractApiError(err));
    } finally {
      setSavingDenom(false);
    }
  }

  function confirmFinalize() {
    Alert.alert(
      'Chốt tiền cuối ca',
      `Tiền mặt kiểm đếm: ${formatCurrency(totalCash)}đ\nTồn cuối dự kiến: ${formatCurrency(expectedClosing)}đ\nChênh lệch: ${difference >= 0 ? '+' : ''}${formatCurrency(difference)}đ\n\nXác nhận chốt ca?`,
      [
        { text: 'Huỷ', style: 'cancel' },
        { text: 'Chốt ca', onPress: () => persistDenominations(true) },
      ]
    );
  }

  async function handleSubmitTx(draft: TxDraft) {
    setTxSaving(true);
    try {
      if (tx.mode === 'add') {
        await addShiftCashTransaction({ date, type: draft.type, amount: draft.amount, note: draft.note, ...geoStamp });
      } else if (tx.editing) {
        await updateShiftCashTransaction(tx.editing.id, { amount: draft.amount, note: draft.note, ...geoStamp });
      }
      setTx((s) => ({ ...s, visible: false, editing: null }));
      await refetch();
    } catch (err) {
      Alert.alert('Lưu thất bại', extractApiError(err));
    } finally {
      setTxSaving(false);
    }
  }

  function confirmDeleteTx(t: IShiftCashTransaction) {
    Alert.alert('Xoá khoản này?', `${t.type} ${formatCurrency(t.amount)}đ${t.note ? ` — ${t.note}` : ''}`, [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Xoá',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteShiftCashTransaction(t.id);
            await refetch();
          } catch (err) {
            Alert.alert('Xoá thất bại', extractApiError(err));
          }
        },
      },
    ]);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Screen scroll refreshing={refreshing} onRefresh={refetch}>
      <AppHeader
        title="Kiểm tiền quầy"
        subtitle="Đối soát tiền mặt cuối ca"
        back
        actions={[{ icon: 'refresh', onPress: refetch }]}
      />

      {/* Date nav */}
      <Card className="p-2.5">
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
      </Card>

      {/* View-only notice */}
      {!isToday && !isAdmin ? (
        <View className="flex-row items-center gap-2 px-3.5 py-2.5 rounded-xl bg-warning-soft">
          <Icon name="lock-outline" size={18} tone="warning" />
          <Text variant="bodySmall" tone="warning" className="flex-1 font-semibold">
            Đang xem ngày cũ — chỉ Admin mới được chỉnh sửa.
          </Text>
        </View>
      ) : null}

      {loading && !summary ? (
        <Loading />
      ) : (
        <>
          {/* Summary */}
          <SectionCard title="Tổng hợp" icon="calculator-variant-outline">
            <View className="gap-2">
              <SummaryRow label="Tồn đầu ca" value={`${formatCurrency(summary?.openingBalance ?? 0)}đ`} />
              <SummaryRow label="+ KiotViet (thực thu)" value={kiotLoading ? '…' : `${formatCurrency(kiotNet)}đ`} />
              {kiot ? (
                <>
                  <SummaryRow label="Tiền mặt" value={`${formatCurrency(kiot.totalCash)}đ`} indent />
                  <SummaryRow label="Chuyển khoản" value={`${formatCurrency(kiot.totalBank)}đ`} indent />
                  <SummaryRow label="Quẹt thẻ" value={`${formatCurrency(kiot.totalCard)}đ`} indent />
                  {kiot.totalReturns > 0 ? (
                    <SummaryRow label="Trả hàng" value={`-${formatCurrency(kiot.totalReturns)}đ`} tone="error" indent />
                  ) : null}
                </>
              ) : null}
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

              {/* Difference */}
              <View className={cn('mt-1 rounded-2xl px-4 py-3 flex-row items-center justify-between', difference >= 0 ? 'bg-success-soft' : 'bg-error-soft')}>
                <View className="flex-row items-center gap-1.5">
                  <Icon name={difference === 0 ? 'check-circle' : 'scale-balance'} size={18} tone={difference >= 0 ? 'success' : 'error'} />
                  <Text variant="subtitle" tone={difference >= 0 ? 'success' : 'error'}>Chênh lệch</Text>
                </View>
                <Text variant="title2" tone={difference >= 0 ? 'success' : 'error'} style={{ fontVariant: ['tabular-nums'] }}>
                  {difference >= 0 ? '+' : ''}{formatCurrency(difference)}đ
                </Text>
              </View>
              {summary?.isFinalized ? (
                <View className="self-start">
                  <Badge tone="success" icon="check-decagram">
                    Đã chốt {summary.finalizations?.length ?? 0} lần
                    {summary.finalizedByName ? ` · ${summary.finalizedByName}` : ''}
                  </Badge>
                </View>
              ) : null}
            </View>
          </SectionCard>

          {/* Denominations */}
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
                  <Text variant="subtitle" tone="primary" style={{ fontVariant: ['tabular-nums'] }}>{formatCurrency(totalCash)}đ</Text>
                </View>

                {denomEditing ? (
                  <View className="flex-row gap-2 mt-3">
                    <Button size="sm" variant="outline" action="neutral" onPress={() => setDenomEditing(false)} className="flex-1">Huỷ</Button>
                    <Button size="sm" variant="outline" icon="content-save-outline" loading={savingDenom} onPress={() => persistDenominations(false)} className="flex-1">Lưu tạm</Button>
                    <Button size="sm" action="primary" icon="check-circle-outline" loading={savingDenom} onPress={confirmFinalize} className="flex-1">Chốt ca</Button>
                  </View>
                ) : null}
              </View>
            )}
          </SectionCard>

          {/* Transactions */}
          <SectionCard title="Thu chi quầy" icon="cash-sync" count={summary?.transactions?.length ?? 0}>
            <View className="flex-row gap-2 mb-1">
              <Button size="sm" action="primary" variant="outline" icon="plus" disabled={!canEdit} onPress={() => setTx({ visible: true, mode: 'add', type: 'Thu', editing: null })} className="flex-1">Thêm thu</Button>
              <Button size="sm" action="error" variant="outline" icon="plus" disabled={!canEdit} onPress={() => setTx({ visible: true, mode: 'add', type: 'Chi', editing: null })} className="flex-1">Thêm chi</Button>
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
                    {canEdit ? (
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

          {/* KiotViet */}
          <SectionCard title="Bán hàng KiotViet" icon="shopping-outline" collapsible defaultExpanded={false}>
            {kiotLoading ? (
              <Loading />
            ) : kiotError || !kiot ? (
              <EmptyState icon="cloud-off-outline" title="Không tải được dữ liệu KiotViet" />
            ) : (
              <View className="flex-row flex-wrap gap-2">
                <Badge tone="neutral" icon="receipt">{kiot.totalInvoices} đơn</Badge>
                <Badge tone="primary">Tổng {formatCurrency(kiot.totalRevenue)}đ</Badge>
                <Badge tone="success">TM {formatCurrency(kiot.totalCash)}đ</Badge>
                <Badge tone="info">CK {formatCurrency(kiot.totalBank)}đ</Badge>
                <Badge tone="warning">Thẻ {formatCurrency(kiot.totalCard)}đ</Badge>
                {kiot.totalReturns > 0 ? <Badge tone="error">Trả -{formatCurrency(kiot.totalReturns)}đ</Badge> : null}
              </View>
            )}
          </SectionCard>
        </>
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
    </Screen>
  );
}
