import { Badge } from 'src/components/ui';
import { t } from 'src/i18n';

// Trạng thái phiếu nhập (core-be PurchaseOrderStatus) → nhãn + màu.
const STATUS: Record<string, { key: string; tone: 'neutral' | 'info' | 'warning' | 'success' | 'error' | 'secondary' }> = {
  Draft: { key: 'erp.poDraft', tone: 'neutral' },
  Confirmed: { key: 'erp.poConfirmed', tone: 'info' },
  PartiallyReceived: { key: 'erp.poPartial', tone: 'warning' },
  Completed: { key: 'erp.poCompleted', tone: 'success' },
  Cancelled: { key: 'erp.poCancelled', tone: 'error' },
  Returned: { key: 'erp.poReturned', tone: 'secondary' },
};

export function PoStatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { key: '', tone: 'neutral' as const };
  return <Badge tone={s.tone}>{s.key ? t(s.key) : status}</Badge>;
}

/** Bộ lọc: số = giá trị enum core-be. */
export const PO_FILTERS: { key: string; status?: number; label: string }[] = [
  { key: 'all', label: 'erp.poAll' },
  { key: 'draft', status: 0, label: 'erp.poDraft' },
  { key: 'confirmed', status: 1, label: 'erp.poConfirmed' },
  { key: 'partial', status: 2, label: 'erp.poPartial' },
  { key: 'completed', status: 3, label: 'erp.poCompleted' },
];
