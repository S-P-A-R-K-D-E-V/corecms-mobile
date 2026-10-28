import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Screen, AppHeader, SectionCard } from 'src/components/shared';
import { Text, Button, Badge, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { extractApiError } from 'src/services/error';
import { getMyShiftStockChecks, reviewShiftStockCheck, saveShiftStockCounts, submitShiftStockCheck } from 'src/api/hr';
import { SHIFT_STOCK_CHECK_STATUS_LABEL, type IShiftStockCheck, type ShiftStockCheckStatus } from 'src/types/hr';
import { parseCount, changedCounts } from './hr-rules';

// ----------------------------------------------------------------------
// Kiểm hàng khu vực mỗi ca (Quy chế Điều 24.3, Nội quy Điều 8 / 11): phiếu tự tạo khi ca bắt đầu cho khu Admin chọn. Người làm ca
// đếm số thực tế trên kệ (không thấy tồn máy) rồi nộp trước giờ hết ca. Chênh lệch chỉ báo lại cho quản lý — không chỉnh tồn
// kho, không phạt. Quản lý (thấy tồn máy + lệch) xác nhận "đã xem".
// ----------------------------------------------------------------------

const STATUS_TONE: Record<ShiftStockCheckStatus, 'warning' | 'info' | 'success' | 'neutral'> = {
  Draft: 'warning',
  Pending: 'info',
  Completed: 'success',
  Cancelled: 'neutral',
};

const fmt = (n?: number | null) => (n == null ? '—' : n.toLocaleString('vi-VN', { maximumFractionDigits: 3 }));

function CheckCard({ check, onChanged }: { check: IShiftStockCheck; onChanged: (c: IShiftStockCheck) => void }) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<'save' | 'submit' | 'ack' | null>(null);
  const editable = check.status === 'Draft';
  const manager = !check.blind;
  const lines = check.lines ?? [];

  useEffect(() => {
    setTexts(Object.fromEntries(lines.map((l) => [l.lineId, l.countedQuantity == null ? '' : String(l.countedQuantity)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [check]);

  const changed = changedCounts(lines, texts);
  const invalid = changed.some((c) => c.quantity === undefined);

  async function save(): Promise<IShiftStockCheck | null> {
    if (changed.length === 0) return check;
    setBusy('save');
    try {
      const saved = await saveShiftStockCounts(check.id, changed.map((c) => ({ lineId: c.lineId, quantity: c.quantity ?? null })));
      onChanged(saved);
      return saved;
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa lưu được số đếm');
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    const saved = await save();
    if (!saved) return;
    setBusy('submit');
    try {
      onChanged(await submitShiftStockCheck(check.id));
      toast.success('Đã nộp phiếu kiểm hàng ca.');
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa nộp được');
    } finally {
      setBusy(null);
    }
  }

  async function acknowledge() {
    setBusy('ack');
    try {
      onChanged(await reviewShiftStockCheck(check.id, 'acknowledge'));
      toast.success('Đã xác nhận đã xem.');
    } catch (err) {
      toast.error(extractApiError(err), 'Chưa xác nhận được');
    } finally {
      setBusy(null);
    }
  }

  return (
    <SectionCard
      title={check.title ?? check.areaName}
      right={
        <Badge tone={check.isOverdue ? 'error' : STATUS_TONE[check.status]}>
          {check.isOverdue ? 'Hết ca chưa nộp' : SHIFT_STOCK_CHECK_STATUS_LABEL[check.status]}
        </Badge>
      }
      bodyClassName="pt-0 gap-2"
    >
      <Text variant="caption" tone="muted">
        Đã đếm {check.countedLines}/{check.totalLines}
        {check.dueAt ? ` · nộp trước ${dayjs(check.dueAt).format('HH:mm')}` : ''}
        {check.submittedByName ? ` · ${check.submittedByName} nộp` : ''}
        {manager && check.varianceLines ? ` · lệch ${check.varianceLines} mặt hàng` : ''}
      </Text>
      {editable && !manager ? (
        <Text variant="caption" tone="muted">Đếm số thực tế trên kệ — không cần đối chiếu với máy.</Text>
      ) : null}
      {lines.map((l) => (
        <View key={l.lineId} className="flex-row items-center gap-3">
          <View className="flex-1">
            <Text variant="bodySmall" className="font-semibold" numberOfLines={2}>{l.productName}</Text>
            <Text variant="caption" tone="muted">
              {l.productCode}
              {l.unit ? ` · ${l.unit}` : ''}
              {manager ? ` · máy ${fmt(l.systemQuantity)}` : ''}
              {manager && l.variance ? ` · lệch ${l.variance > 0 ? '+' : ''}${fmt(l.variance)}` : ''}
            </Text>
          </View>
          {editable ? (
            <View style={{ width: 96 }}>
              <TextField
                value={texts[l.lineId] ?? ''}
                onChangeText={(v) => setTexts((t) => ({ ...t, [l.lineId]: v }))}
                keyboardType="decimal-pad"
                placeholder="Số đếm"
                error={parseCount(texts[l.lineId] ?? '') === undefined ? 'Sai' : undefined}
                accessibilityLabel={`Số đếm ${l.productName}`}
              />
            </View>
          ) : (
            <Text className="font-semibold" tone={manager && l.variance ? 'error' : 'default'}>{fmt(l.countedQuantity)}</Text>
          )}
        </View>
      ))}
      {editable ? (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button size="sm" variant="outline" loading={busy === 'save'} disabled={!!busy || invalid || changed.length === 0} onPress={save}>
              Lưu số đếm
            </Button>
          </View>
          <View className="flex-1">
            <Button size="sm" icon="check" loading={busy === 'submit'} disabled={!!busy || invalid} onPress={submit}>
              Nộp phiếu
            </Button>
          </View>
        </View>
      ) : null}
      {manager && check.status === 'Pending' ? (
        <Button size="sm" variant="outline" loading={busy === 'ack'} disabled={!!busy} onPress={acknowledge}>
          Đã xem
        </Button>
      ) : null}
    </SectionCard>
  );
}

export function HrStockCheckScreen() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['hr', 'stock-checks'], queryFn: getMyShiftStockChecks });
  const list = query.data ?? [];

  function replace(next: IShiftStockCheck) {
    qc.setQueryData<IShiftStockCheck[]>(['hr', 'stock-checks'], (old) => (old ?? []).map((c) => (c.id === next.id ? next : c)));
  }

  return (
    <Screen scroll refreshing={query.isFetching} onRefresh={() => query.refetch()}>
      <AppHeader title="Kiểm hàng ca" back />
      <Text variant="caption" tone="muted">
        Mỗi ca kiểm một khu nhỏ do Admin chọn. Chênh lệch chỉ báo cho quản lý — không chỉnh tồn kho, không phạt.
      </Text>
      {query.isError ? (
        <View className="py-10 items-center gap-3">
          <Text variant="bodySmall" tone="error">Không tải được phiếu kiểm hàng: {extractApiError(query.error)}</Text>
          <Button size="sm" variant="outline" fullWidth={false} onPress={() => query.refetch()}>Thử lại</Button>
        </View>
      ) : !query.isLoading && list.length === 0 ? (
        <View className="py-10 items-center">
          <Text variant="bodySmall" tone="muted" className="text-center">
            Hôm nay ca của bạn chưa có phiếu kiểm hàng — phiếu tự tạo khi ca bắt đầu.
          </Text>
        </View>
      ) : (
        list.map((c) => <CheckCard key={c.id} check={c} onChanged={replace} />)
      )}
    </Screen>
  );
}
