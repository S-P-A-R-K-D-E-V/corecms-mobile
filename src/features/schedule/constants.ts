import type { PoolNeedType, PoolPostStatus } from 'src/types/corecms-api';
import type { IconName } from 'src/components/ui';

export const NEED_TYPE_LABEL: Record<PoolNeedType, string> = {
  Swap: 'Đổi ca',
  FullCover: 'Làm hộ cả ca',
  PartialCover: 'Làm hộ 1 phần',
};

export const POOL_STATUS_LABEL: Record<PoolPostStatus, string> = {
  Open: 'Đang mở',
  WaitingApproval: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Cancelled: 'Đã huỷ',
};

export const POOL_STATUS_TONE: Record<PoolPostStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  Open: 'info',
  WaitingApproval: 'warning',
  Approved: 'success',
  Cancelled: 'neutral',
};

export const NEED_OPTIONS: { value: PoolNeedType; label: string; desc: string; icon: IconName }[] = [
  { value: 'FullCover', label: 'Làm hộ cả ca', desc: 'Nhờ người khác làm toàn bộ ca', icon: 'account-arrow-right-outline' },
  { value: 'PartialCover', label: 'Làm hộ một phần', desc: 'Nhờ làm hộ đầu ca (đến trễ) hoặc cuối ca (về sớm)', icon: 'clock-outline' },
  { value: 'Swap', label: 'Đổi ca', desc: 'Muốn đổi lấy ca của người nhận', icon: 'swap-horizontal' },
];

export const DAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function fmtMoney(v?: number) {
  return v != null ? `${v.toLocaleString('vi-VN')}đ` : '';
}
