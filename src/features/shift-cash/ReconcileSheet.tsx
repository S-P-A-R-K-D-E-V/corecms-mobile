import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';

import { Sheet, Loading } from 'src/components/shared';
import { Text, Badge, Button, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { extractApiError } from 'src/services/error';
import { getShiftCashReconciliation, getShiftCashInvestigation } from 'src/api/shiftCash';
import type {
  IShiftCashGeoStamp,
  IReconciliationRow,
  IShiftCashFinding,
  IShiftCashReconciliation,
  ShiftCashInvoiceIssue,
} from 'src/types/corecms-api';

import { formatCurrency } from './utils';

// ── Kiểm tra chênh lệch (app) ────────────────────────────────────────────────
// Mở khi bấm dòng "Chênh lệch" ở màn Kiểm tiền quầy (người được xem doanh thu). Số của HỆ THỐNG nên dùng được ở mọi
// cửa hàng và cả khi chưa chốt: két, chuyển khoản trên hoá đơn ↔ tiền ngân hàng thực nhận, KiotViet ↔ hệ thống (cửa
// hàng nối KiotViet). Người giám sát xem thêm nguyên nhân có thể của lệch két (ngày đã chốt).

const ISSUE_LABEL: Record<ShiftCashInvoiceIssue, string> = {
  'missing-in-system': 'Chưa về hệ thống',
  'not-on-kiotviet': 'KiotViet đã huỷ / không có',
  amount: 'Lệch tổng tiền',
  payment: 'Lệch phương thức',
};

const STRENGTH: Record<IShiftCashFinding['strength'], { label: string; tone: 'error' | 'warning' | 'neutral' }> = {
  Strong: { label: 'Khả năng cao', tone: 'error' },
  Medium: { label: 'Có thể', tone: 'warning' },
  Weak: { label: 'Gợi ý', tone: 'neutral' },
};

const NUM = { fontVariant: ['tabular-nums' as const] };

function signed(value: number): string {
  if (Math.abs(value) < 1) return 'khớp';
  return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}đ`;
}

function diffTone(value: number | null): 'success' | 'error' | 'warning' | 'muted' {
  if (value === null) return 'muted';
  if (Math.abs(value) < 1) return 'success';
  return value < 0 ? 'error' : 'warning';
}

export type ReconcileSheetProps = {
  visible: boolean;
  date: string;
  geo: IShiftCashGeoStamp | null;
  /** Người giám sát Kiểm quầy: xem thêm nguyên nhân lệch két. */
  canOversee: boolean;
  onClose: () => void;
};

export function ReconcileSheet({ visible, date, geo, canOversee, onClose }: ReconcileSheetProps) {
  const reconQ = useQuery({
    queryKey: ['shift-cash', 'reconciliation', date],
    queryFn: () => getShiftCashReconciliation(date, geo),
    enabled: visible,
    retry: false,
  });
  const investigationQ = useQuery({
    queryKey: ['shift-cash', 'investigation', date],
    queryFn: () => getShiftCashInvestigation(date, geo),
    enabled: visible && canOversee,
    retry: false,
  });

  const result = reconQ.data;

  return (
    <Sheet
      visible={visible}
      title="Kiểm tra chênh lệch"
      onClose={onClose}
      footer={
        <Button variant="outline" icon="refresh" loading={reconQ.isFetching} onPress={() => { reconQ.refetch(); if (canOversee) investigationQ.refetch(); }}>
          Kiểm tra lại
        </Button>
      }
    >
      {reconQ.isLoading ? (
        <Loading />
      ) : reconQ.isError || !result ? (
        <View className="py-6 items-center gap-2">
          <Text tone="error" className="text-center">Không kiểm tra được chênh lệch</Text>
          <Text variant="caption" tone="muted" className="text-center">{extractApiError(reconQ.error)}</Text>
        </View>
      ) : (
        <View className="gap-4 pb-2">
          <ReconcileBody result={result} />
          {canOversee ? (
            <View className="gap-2">
              <Divider />
              <Text variant="subtitle">Nguyên nhân có thể của lệch két</Text>
              {investigationQ.isLoading ? (
                <Loading />
              ) : investigationQ.isError ? (
                <Text variant="bodySmall" tone="error">Không tải được nguyên nhân lệch két.</Text>
              ) : !investigationQ.data ? (
                <Text variant="bodySmall" tone="muted">Ngày này chưa chốt quầy — chốt xong mới tìm được nguyên nhân lệch két.</Text>
              ) : investigationQ.data.findings.length === 0 ? (
                <Text variant="bodySmall" tone="muted">{investigationQ.data.driftNote ?? 'Không tìm thấy nguyên nhân rõ ràng.'}</Text>
              ) : (
                investigationQ.data.findings.map((f, i) => (
                  <View key={`${f.code}-${i}`} className="gap-1 rounded-2xl px-3.5 py-2.5 bg-bg dark:bg-surface-dark">
                    <View className="flex-row items-center gap-2">
                      <Badge tone={STRENGTH[f.strength].tone}>{STRENGTH[f.strength].label}</Badge>
                      <Text variant="bodySmall" className="font-semibold flex-1">{f.title}</Text>
                    </View>
                    <Text variant="caption" tone="muted">{f.detail}</Text>
                  </View>
                ))
              )}
            </View>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

function ReconcileBody({ result }: { result: IShiftCashReconciliation }) {
  const { drawer, bank, kiotViet, kiotVietConnected, rows, notes } = result;
  const showKiotViet = kiotVietConnected && !!kiotViet?.ok && !!kiotViet.totals;
  const time = (iso: string) => dayjs(iso).format('HH:mm');

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-2">
        <Badge tone={result.allMatched ? 'success' : 'warning'} icon={result.allMatched ? 'check-circle' : 'alert'}>
          {result.allMatched ? 'Khớp' : 'Có chênh lệch'}
        </Badge>
        <Text variant="caption" tone="muted" className="flex-1">
          {drawer.isFinalized ? `Đã chốt lúc ${drawer.finalizedAt ? time(drawer.finalizedAt) : '—'}` : 'Chưa chốt'}
        </Text>
      </View>

      {/* Nhận xét dựng sẵn từ BE */}
      <View className="gap-1.5">
        {notes.map((note) => (
          <View key={note} className="flex-row gap-2">
            <Text variant="bodySmall" tone="muted">•</Text>
            <Text variant="bodySmall" className="flex-1">{note}</Text>
          </View>
        ))}
      </View>

      {/* Bảng theo kênh tiền: mỗi dòng một khoản, so sánh ở dòng phụ — vừa màn hẹp / chữ to. */}
      <View className="gap-2.5">
        <Text variant="subtitle">Đối chiếu doanh thu</Text>
        {rows.map((row) => (
          <ReconcileRow key={row.key} row={row} showKiotViet={showKiotViet} />
        ))}
      </View>

      {bank.missingCredits.length > 0 ? (
        <DetailList
          title={`Chuyển khoản chưa thấy tiền về (${bank.missingCredits.length})`}
          items={bank.missingCredits.map((m) => ({ key: m.salesOrderId, left: `${m.code} · ${time(m.at)}`, right: formatCurrency(m.amount) }))}
        />
      ) : null}
      {bank.unmatchedCredits.length > 0 ? (
        <DetailList
          title={`Tiền về chưa khớp hoá đơn (${bank.unmatchedCredits.length})`}
          hint="Có thể khách chuyển khoản mà hoá đơn ghi tiền mặt, hoặc tiền không phải bán hàng."
          items={bank.unmatchedCredits.map((c, i) => ({
            key: `${c.at}-${i}`,
            left: `${time(c.at)}${c.linkedInvoiceCode ? ` · QR của ${c.linkedInvoiceCode}` : ''}`,
            right: formatCurrency(c.amount),
          }))}
        />
      ) : null}
      {kiotViet && kiotViet.diffs.length > 0 ? (
        <DetailList
          title={`Lệch KiotViet ↔ hệ thống (${kiotViet.diffs.length})`}
          items={kiotViet.diffs.map((d) => ({
            key: `${d.code}-${d.issue}`,
            left: `${d.code} · ${ISSUE_LABEL[d.issue]}`,
            sub: d.detail,
            right: formatCurrency(d.kiotVietTotal ?? d.systemTotal ?? 0),
          }))}
        />
      ) : null}
    </View>
  );
}

function ReconcileRow({ row, showKiotViet }: { row: IReconciliationRow; showKiotViet: boolean }) {
  const sign = row.key === 'returns' ? '−' : '';
  return (
    <View className={cn('gap-0.5', row.key === 'net' && 'pt-1.5 border-t border-line/50 dark:border-line-dark/50')}>
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="bodySmall" className={cn('flex-1', row.key === 'net' && 'font-bold')}>{row.label}</Text>
        <Text variant="bodySmall" className="font-semibold" style={NUM}>{sign}{formatCurrency(row.system)}đ</Text>
      </View>
      {showKiotViet && row.kiotViet !== null ? (
        <View className="flex-row items-center justify-between gap-3 pl-3">
          <Text variant="caption" tone="faint" className="flex-1">KiotViet {sign}{formatCurrency(row.kiotViet)}đ</Text>
          <Text variant="caption" tone={diffTone(row.kiotVietDiff)} style={NUM}>{signed(row.kiotVietDiff ?? 0)}</Text>
        </View>
      ) : null}
      {row.bank !== null ? (
        <View className="flex-row items-center justify-between gap-3 pl-3">
          <Text variant="caption" tone="faint" className="flex-1">Ngân hàng nhận {formatCurrency(row.bank)}đ</Text>
          <Text variant="caption" tone={diffTone(row.bankDiff)} style={NUM}>{signed(row.bankDiff ?? 0)}</Text>
        </View>
      ) : null}
    </View>
  );
}

type DetailItem = { key: string; left: string; sub?: string; right: string };

function DetailList({ title, hint, items }: { title: string; hint?: string; items: DetailItem[] }) {
  return (
    <View className="gap-1.5">
      <Text variant="bodySmall" className="font-semibold">{title}</Text>
      {hint ? <Text variant="caption" tone="muted">{hint}</Text> : null}
      {items.map((item) => (
        <View key={item.key} className="flex-row justify-between gap-3 pl-3">
          <View className="flex-1">
            <Text variant="caption">{item.left}</Text>
            {item.sub ? <Text variant="caption" tone="muted">{item.sub}</Text> : null}
          </View>
          <Text variant="caption" style={NUM}>{item.right}</Text>
        </View>
      ))}
    </View>
  );
}
