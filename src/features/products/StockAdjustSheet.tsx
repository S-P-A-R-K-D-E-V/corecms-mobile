import { useRef, useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Sheet } from 'src/components/shared';
import { Text, Icon, Badge, Button, Chip, TextField, SegmentedControl, Spinner, Divider } from 'src/components/ui';
import { haptics } from 'src/services/haptics';
import { createStockAdjustment, retryStockAdjustment } from 'src/api/erp';
import { t } from 'src/i18n';
import type { IProductInventory, StockAdjustmentMode, StockAdjustmentReason, StockAdjustmentStatus } from 'src/types/erp';

import { InfoRow, fmtQty } from 'src/features/erp/shared';
import { invalidateProductStock, kickStockAdjustmentPolling, useStockAdjustments } from './hooks';
import {
  STOCK_REASONS,
  createRequestIdKeeper,
  isApplied,
  isInFlight,
  parseQuantity,
  previewOnHand,
  reasonLabel,
  signedQuantity,
  stockAdjustErrorMessage,
  validateAdjustment,
} from './stock-adjust';

// ----------------------------------------------------------------------
// "Sửa tồn" (chỉ chủ cửa hàng): 1 hàng (hoặc 1 biến thể) tại 1 chi nhánh. Đặt số đếm được hoặc cộng/trừ,
// kèm lý do + ghi chú. Cửa hàng nối KiotViet: BE đẩy sang KiotViet rồi mới đổi tồn trên app — sheet chuyển sang
// phần trạng thái (chờ đẩy → đã lên KiotViet / lỗi + Thử lại). Cửa hàng không nối KiotViet: đổi ngay (Local).
// ----------------------------------------------------------------------

export type StockTarget = {
  /** Hàng thường, hoặc id biến thể — không phải hàng gộp biến thể. */
  productId: string;
  name: string;
  inventories: IProductInventory[];
};

type Submitted = { id: string; status: StockAdjustmentStatus | string };

/** Nhãn trạng thái của 1 lần chỉnh tồn. */
export function StockAdjustStatusBadge({ status }: { status?: string | null }) {
  const key = `erp.stockAdj.status.${status}`;
  const label = t(key);
  const text = label === key ? String(status ?? '') : label;
  if (isApplied(status)) return <Badge tone="success" icon="check">{text}</Badge>;
  if (status === 'Failed') return <Badge tone="error" icon="alert-circle-outline">{text}</Badge>;
  if (isInFlight(status)) return <Badge tone="info" icon="sync">{text}</Badge>;
  return text ? <Badge tone="neutral">{text}</Badge> : null;
}

/** Chi nhánh chỉnh được: có id chi nhánh KiotViet. */
export const adjustableInventories = (inventories?: IProductInventory[] | null) =>
  (inventories ?? []).filter((i): i is IProductInventory & { branchId: number } => typeof i.branchId === 'number');

export function StockAdjustSheet({
  target,
  initialBranchId,
  onClose,
}: {
  target: StockTarget | null;
  initialBranchId?: number | null;
  onClose: () => void;
}) {
  if (!target) return null;
  // key: mở cho hàng / chi nhánh khác → form mới tinh.
  return <StockAdjustForm key={`${target.productId}:${initialBranchId ?? ''}`} target={target} initialBranchId={initialBranchId} onClose={onClose} />;
}

function StockAdjustForm({ target, initialBranchId, onClose }: { target: StockTarget; initialBranchId?: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const branches = adjustableInventories(target.inventories);
  const [branchId, setBranchId] = useState<number | undefined>(
    branches.find((b) => b.branchId === initialBranchId)?.branchId ?? branches[0]?.branchId
  );
  const [mode, setMode] = useState<StockAdjustmentMode>('Set');
  const [sign, setSign] = useState<1 | -1>(1);
  const [amountText, setAmountText] = useState('');
  const [reason, setReason] = useState<StockAdjustmentReason>('Count');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const requestIds = useRef(createRequestIdKeeper()).current;

  const branch = branches.find((b) => b.branchId === branchId);
  const current = branch?.onHand ?? 0;
  const amount = parseQuantity(amountText);
  const quantity = amount === null ? null : signedQuantity(mode, amount, sign);
  const typed = amountText.trim() !== '';
  const problem = typed ? validateAdjustment(current, mode, quantity) : null;
  const preview = typed && problem === null && quantity !== null ? previewOnHand(current, mode, quantity) : null;

  // Sau khi gửi: hỏi lại danh sách của hàng này tới khi KiotViet nhận / lỗi.
  const list = useStockAdjustments(target.productId, !!submitted);
  const live = submitted ? list.data?.find((a) => a.id === submitted.id) : undefined;
  const status = live?.status ?? submitted?.status;

  const create = useMutation({
    mutationFn: () => {
      const payload = { branchId: branch!.branchId, mode, quantity: quantity!, reason, note: note.trim() || undefined };
      return createStockAdjustment(target.productId, { ...payload, clientRequestId: requestIds.idFor(payload) });
    },
    onSuccess: (res) => {
      haptics.success();
      requestIds.reset();
      setError(null);
      setSubmitted({ id: res.id, status: res.status });
      kickStockAdjustmentPolling(qc, target.productId);
      invalidateProductStock(qc);
    },
    onError: (err) => {
      haptics.error();
      setError(stockAdjustErrorMessage(err));
    },
  });

  // Lỗi hiện ngay trong sheet (toast nằm dưới Modal trên iOS, không thấy được).
  const retry = useMutation({
    mutationFn: () => retryStockAdjustment(submitted!.id),
    onSuccess: () => {
      haptics.light();
      setError(null);
      kickStockAdjustmentPolling(qc, target.productId);
    },
    onError: (err) => {
      haptics.error();
      setError(stockAdjustErrorMessage(err));
    },
  });

  const failed = status === 'Failed';

  const footer = submitted ? (
    <View className="flex-row gap-2">
      {failed ? (
        <View className="flex-1">
          <Button icon="refresh" loading={retry.isPending} onPress={() => retry.mutate()}>{t('common.retry')}</Button>
        </View>
      ) : null}
      <View className="flex-1">
        <Button variant={failed ? 'soft' : 'solid'} onPress={onClose}>{t('common.done')}</Button>
      </View>
    </View>
  ) : branch ? (
    <Button icon="content-save-outline" loading={create.isPending} disabled={!typed || problem !== null} onPress={() => create.mutate()}>
      {t('erp.stockAdj.save')}
    </Button>
  ) : undefined;

  return (
    <Sheet visible title={t('erp.stockAdj.title')} onClose={onClose} footer={footer}>
      {submitted ? (
        <View className="gap-3 pb-2">
          <SubmittedStatus
            name={target.name}
            branchName={branch?.branchName || '—'}
            status={status}
            before={live?.localOnHandBefore ?? current}
            after={live?.kvOnHandAfter ?? live?.targetOnHand ?? null}
            error={live?.error}
          />
          {error ? <ErrorBox message={error} /> : null}
        </View>
      ) : !branch ? (
        <Text variant="bodySmall" tone="muted" className="py-4">{t('erp.stockAdj.noBranch')}</Text>
      ) : (
        <View className="gap-4 pb-2">
          <Text variant="bodySmall" tone="muted" numberOfLines={2}>{target.name}</Text>

          {branches.length > 1 ? (
            <View className="gap-2">
              <Text variant="footnote" tone="muted" className="font-semibold ml-1">{t('erp.stockAdj.branch')}</Text>
              <View className="flex-row flex-wrap gap-2">
                {branches.map((b) => (
                  <Chip
                    key={b.branchId}
                    label={`${b.branchName || '—'} · ${fmtQty(b.onHand ?? 0)}`}
                    color="primary"
                    selected={b.branchId === branchId}
                    onPress={() => {
                      setBranchId(b.branchId);
                      setError(null);
                    }}
                  />
                ))}
              </View>
            </View>
          ) : (
            <InfoRow label={t('erp.stockAdj.branch')} value={branch.branchName || '—'} />
          )}
          <InfoRow label={t('erp.stockAdj.current')} value={fmtQty(current)} strong />

          <SegmentedControl
            segments={[
              { key: 'Set', label: t('erp.stockAdj.modeSet') },
              { key: 'Delta', label: t('erp.stockAdj.modeDelta') },
            ]}
            value={mode}
            onChange={(k) => {
              setMode(k as StockAdjustmentMode);
              setError(null);
            }}
          />

          {mode === 'Delta' ? (
            // Bàn phím số của iOS không có dấu trừ → chọn cộng / trừ bằng nút.
            <View className="flex-row gap-2">
              <Chip label={t('erp.stockAdj.add')} icon="plus" color="success" selected={sign === 1} onPress={() => setSign(1)} />
              <Chip label={t('erp.stockAdj.subtract')} icon="minus" color="error" selected={sign === -1} onPress={() => setSign(-1)} />
            </View>
          ) : null}

          <View className="gap-1.5">
            <TextField
              label={mode === 'Set' ? t('erp.stockAdj.countedQty') : t('erp.stockAdj.deltaQty')}
              value={amountText}
              onChangeText={(v) => {
                setAmountText(v);
                setError(null);
              }}
              keyboardType="decimal-pad"
              placeholder="0"
              error={problem ? t(`erp.stockAdj.${problem}`) : undefined}
            />
            {preview !== null ? (
              <View className="flex-row items-center gap-1.5 ml-1">
                <Text variant="bodySmall" tone="muted">{fmtQty(current)}</Text>
                <Icon name="arrow-right" size={14} tone="muted" />
                <Text variant="bodySmall" tone="primary" className="font-bold">{t('erp.stockAdj.newOnHand', { n: fmtQty(preview) })}</Text>
              </View>
            ) : null}
            {mode === 'Delta' ? <Text variant="caption" tone="muted" className="ml-1">{t('erp.stockAdj.deltaHint')}</Text> : null}
          </View>

          <View className="gap-2">
            <Text variant="footnote" tone="muted" className="font-semibold ml-1">{t('erp.stockAdj.reasonLabel')}</Text>
            <View className="flex-row flex-wrap gap-2">
              {STOCK_REASONS.map((r) => (
                <Chip key={r} label={reasonLabel(r)} color="primary" selected={reason === r} onPress={() => setReason(r)} />
              ))}
            </View>
          </View>

          <TextField
            label={t('erp.stockAdj.note')}
            value={note}
            onChangeText={setNote}
            placeholder={reason === 'Other' ? t('erp.stockAdj.notePlaceholderOther') : t('erp.stockAdj.notePlaceholder')}
            maxLength={500}
            multiline
          />

          {error ? <ErrorBox message={error} /> : null}
        </View>
      )}
    </Sheet>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <View className="flex-row items-start gap-2 rounded-xl bg-error-soft px-3 py-2.5">
      <Icon name="alert-circle-outline" size={18} tone="error" />
      <Text variant="bodySmall" tone="error" className="flex-1">{message}</Text>
    </View>
  );
}

/** Sau khi gửi: trạng thái đẩy KiotViet của lần chỉnh vừa tạo. */
function SubmittedStatus({
  name,
  branchName,
  status,
  before,
  after,
  error,
}: {
  name: string;
  branchName: string;
  status?: string;
  before: number;
  after: number | null;
  error?: string | null;
}) {
  const applied = isApplied(status);
  const failed = status === 'Failed';
  const title =
    status === 'Local'
      ? t('erp.stockAdj.localTitle')
      : status === 'Synced'
        ? t('erp.stockAdj.syncedTitle')
        : failed
          ? t('erp.stockAdj.failedTitle')
          : t('erp.stockAdj.pendingTitle');

  return (
    <View className="gap-4">
      <View className="items-center gap-2 pt-2">
        {applied ? (
          <Icon name="check-circle" size={48} tone="success" />
        ) : failed ? (
          <Icon name="alert-circle" size={48} tone="error" />
        ) : (
          <View style={{ height: 48, justifyContent: 'center' }}>
            <Spinner size="large" />
          </View>
        )}
        <Text variant="headline" className="text-center">{title}</Text>
        <StockAdjustStatusBadge status={status} />
      </View>

      <View>
        <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{name}</Text>
        <Divider className="my-1.5" />
        <InfoRow label={t('erp.stockAdj.branch')} value={branchName} />
        <InfoRow label={t('erp.stockAdj.before')} value={fmtQty(before)} />
        {applied && after !== null ? <InfoRow label={t('erp.stockAdj.after')} value={fmtQty(after)} strong tone="primary" /> : null}
      </View>

      {failed ? (
        <Text variant="bodySmall" tone="error">{error || t('erp.stockAdj.failedHint')}</Text>
      ) : !applied ? (
        <Text variant="bodySmall" tone="muted">{t('erp.stockAdj.pendingMsg')}</Text>
      ) : null}
    </View>
  );
}
