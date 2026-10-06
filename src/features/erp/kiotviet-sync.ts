import type { BadgeProps } from 'src/components/ui/badge';

// ----------------------------------------------------------------------
// Trạng thái đẩy hoá đơn sang KiotViet (core-be `kiotVietSyncStatus`) → app hiện gì. Phần logic không dính
// giao diện; nhãn: SyncBadge (shared.tsx), dòng "đang đẩy sang KiotViet" sau khi bán: PosScreen.
// ----------------------------------------------------------------------

export type SyncBadgeSpec = {
  tone: NonNullable<BadgeProps['tone']>;
  icon: NonNullable<BadgeProps['icon']>;
  /** Khoá i18n của chữ trên nhãn. */
  labelKey: string;
};

/**
 * Nhãn đồng bộ KiotViet của 1 hoá đơn; null = không hiện gì.
 * Chỉ Pending/Pushing mới là "đang đẩy". None (đơn từ KiotViet về), NotPushed (chỉ lưu trong hệ thống, không
 * đẩy KiotViet — trạng thái bình thường, không phải lỗi) và mọi giá trị lạ (BE thêm trạng thái mới) đều không
 * hiện — không được rơi về "đang đẩy".
 */
export function syncBadge(status?: string | null): SyncBadgeSpec | null {
  switch (status) {
    case 'Pending':
    case 'Pushing':
      return { tone: 'info', icon: 'sync', labelKey: 'erp.syncPending' };
    case 'Synced':
      return { tone: 'success', icon: 'check', labelKey: 'erp.synced' };
    case 'Failed':
      return { tone: 'error', icon: 'alert-circle-outline', labelKey: 'erp.syncFailed' };
    default:
      return null;
  }
}

/**
 * Hoá đơn vừa tạo (kết quả POST /sales-orders) có được xếp hàng đẩy sang KiotViet không. BE mới trả kèm
 * `kiotVietSyncStatus` (Pending | NotPushed); BE cũ chỉ trả `id` → không biết thì coi như không đẩy, để
 * không báo "đang đẩy sang KiotViet" cho hoá đơn chỉ lưu trong hệ thống.
 */
export function isSaleQueuedForKiotViet(res: unknown): boolean {
  return !!res && typeof res === 'object' && (res as { kiotVietSyncStatus?: unknown }).kiotVietSyncStatus === 'Pending';
}
