import type { MessageCard, MessageCardAction } from 'src/api/messenger';
import type { IconName } from 'src/components/ui/icon';
import { t } from 'src/i18n';
import { extractApiError } from 'src/services/error';
import { notificationAppRoute, notificationTargetRoute } from 'src/services/notification-links';

// ----------------------------------------------------------------------
// Phần thuần của thẻ hành động trong nhóm "Quản trị – Đội agent" (test được): trạng thái thẻ (mở / đã xử lý / hết hạn),
// nút nào được hiện cho người đang xem, nút → kiểu hiển thị, thẻ mở màn nào trên app, lỗi khi bấm nút → câu báo.
// Hợp đồng: docs/cici/plans/a1-nhom-quan-tri-api-contract.md mục 2.
// ----------------------------------------------------------------------

export type CardState = 'open' | 'done' | 'expired';

/** Nút cần quyền agent.approve (duyệt / sửa / từ chối phiếu, trả lời việc). "open" chỉ điều hướng. */
export const CARD_DECISION_KEYS = ['approve', 'revise', 'reject', 'reply'] as const;
const KNOWN_KEYS: readonly string[] = [...CARD_DECISION_KEYS, 'open'];

/** Độ dài tối đa câu trả lời gửi agent (POST agent-center/tasks/{id}/notes). */
export const CARD_REPLY_MAX = 4000;
/** Ghi chú yêu cầu sửa / lý do từ chối — như màn Duyệt. */
export const CARD_NOTE_MAX = 1000;

/**
 * Mốc thời gian của thẻ → ms. Chuỗi không có múi giờ (BE trả DateTime không kèm "Z") coi là UTC, như mọi mốc của máy chủ.
 * Không đọc được → null.
 */
export function parseCardTime(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== 'string') return null;
  const value = iso.trim();
  const hasZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  const ms = new Date(hasZone || !/T\d/.test(value) ? value : `${value}Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** done → đã xử lý; còn open mà đã quá expiresAt → hết hạn; còn lại → mở. Trạng thái lạ coi như mở. */
export function cardState(card: Pick<MessageCard, 'status' | 'expiresAt'>, now: number = Date.now()): CardState {
  if (card.status === 'done') return 'done';
  const expires = parseCardTime(card.expiresAt);
  if (expires !== null && expires <= now) return 'expired';
  return 'open';
}

/** Dòng trạng thái dưới thẻ: done → statusText của máy chủ (thiếu → "Đã xử lý"); hết hạn → "Hết hạn"; mở → null. */
export function cardStatusText(card: Pick<MessageCard, 'status' | 'statusText' | 'expiresAt'>, now: number = Date.now()): string | null {
  const state = cardState(card, now);
  if (state === 'done') return card.statusText?.trim() || t('chat.card.done');
  if (state === 'expired') return t('chat.card.expired');
  return null;
}

/**
 * Nút được hiện cho người đang xem: thẻ không còn mở → không nút nào; nút lạ bị bỏ; nút duyệt / sửa / từ chối / trả lời chỉ
 * khi có quyền agent.approve; bỏ nút trùng khoá. Thứ tự giữ như máy chủ gửi.
 */
export function visibleCardActions(
  card: Pick<MessageCard, 'status' | 'expiresAt' | 'actions'>,
  opts: { canApprove: boolean; now?: number },
): MessageCardAction[] {
  if (cardState(card, opts.now ?? Date.now()) !== 'open') return [];
  const seen = new Set<string>();
  const out: MessageCardAction[] = [];
  for (const action of card.actions ?? []) {
    const key = action?.key;
    if (!key || !KNOWN_KEYS.includes(key) || seen.has(key)) continue;
    if (!opts.canApprove && (CARD_DECISION_KEYS as readonly string[]).includes(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

/** Kiểu nút theo style: primary → nền đặc, danger → viền đỏ, còn lại → viền trung tính. */
export function cardActionLook(style: string | null | undefined): { variant: 'solid' | 'outline'; action: 'primary' | 'error' | 'neutral' } {
  if (style === 'primary') return { variant: 'solid', action: 'primary' };
  if (style === 'danger') return { variant: 'outline', action: 'error' };
  return { variant: 'outline', action: 'neutral' };
}

export function isApprovalCard(card: Pick<MessageCard, 'kind'>): boolean {
  return card.kind === 'approval';
}

/** Guid dạng 32 ký tự liền (.NET "N") → dạng có gạch; dạng khác giữ nguyên. */
export function dashedGuid(id: string | null | undefined): string {
  const value = (id ?? '').trim();
  const m = /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/i.exec(value);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : value;
}

/**
 * Màn trên app khi bấm "Mở" / chạm tiêu đề thẻ: phiếu → chi tiết phiếu, việc → chi tiết việc (notification-links, theo refId);
 * refId hỏng → đổi `link` (đường dẫn web) bằng notificationAppRoute; vẫn không được → danh sách Duyệt / Việc của agent.
 */
export function cardTargetRoute(card: Pick<MessageCard, 'kind' | 'refId' | 'link'>): string {
  const approval = isApprovalCard(card);
  const id = dashedGuid(card.refId);
  const data = approval ? { agentActionId: id } : { agentTaskId: id };
  return (
    notificationTargetRoute(null, data) ??
    notificationAppRoute(card.link) ??
    (approval ? '/agent/approvals' : '/agent/tasks')
  );
}

/** Nhãn nhỏ đầu thẻ + icon theo loại. */
export function cardKindInfo(kind: string): { label: string; icon: IconName; tone: 'warning' | 'info' | 'error' | 'success' } {
  switch (kind) {
    case 'approval':
      return { label: t('chat.card.kindApproval'), icon: 'shield-check-outline', tone: 'warning' };
    case 'task_question':
      return { label: t('chat.card.kindQuestion'), icon: 'help-circle-outline', tone: 'info' };
    case 'task_failed':
      return { label: t('chat.card.kindFailed'), icon: 'alert-circle-outline', tone: 'error' };
    default:
      return { label: t('chat.card.kindResult'), icon: 'clipboard-check-outline', tone: 'success' };
  }
}

/** Nhãn nút "Mở" khi máy chủ không gửi nút open: phiếu → "Mở phiếu", việc → "Mở việc". */
export function cardOpenLabel(card: Pick<MessageCard, 'kind'>): string {
  return isApprovalCard(card) ? t('chat.card.openApproval') : t('chat.card.openTask');
}

/**
 * Lỗi khi bấm nút → câu báo + có nạp lại tin không. 403 → "Bạn không có quyền duyệt agent"; 409 (phiếu đã xử lý / hết hạn)
 * và 404 → câu của máy chủ (detail / title / message), nạp lại; lỗi khác → câu chung, không nạp lại.
 */
export function cardErrorInfo(err: unknown): { message: string; reload: boolean; changed: boolean } {
  const status = err && typeof err === 'object' ? (err as { status?: unknown }).status : undefined;
  if (status === 403) return { message: t('chat.card.noPermission'), reload: false, changed: false };
  if (status === 409 || status === 404) {
    const e = err as { detail?: unknown; title?: unknown; message?: unknown };
    const text = [e.detail, e.title, e.message].find((v): v is string => typeof v === 'string' && v.trim() !== '');
    return { message: text ?? extractApiError(err), reload: true, changed: true };
  }
  return { message: extractApiError(err), reload: false, changed: false };
}
