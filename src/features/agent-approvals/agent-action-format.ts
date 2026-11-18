import type { AgentActionView } from 'src/api/agent-actions';

// ----------------------------------------------------------------------
// Phần thuần của màn Duyệt việc agent (test được): nhãn trạng thái, thời gian còn lại, tham số của lệnh từ bodyJson,
// kết quả chạy sau khi duyệt.
// ----------------------------------------------------------------------

type Tone = 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'secondary';

export const AGENT_ACTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Chờ duyệt', tone: 'warning' },
  approved: { label: 'Đã duyệt', tone: 'info' },
  executing: { label: 'Đang chạy', tone: 'info' },
  executed: { label: 'Đã chạy', tone: 'success' },
  failed: { label: 'Chạy lỗi', tone: 'error' },
  rejected: { label: 'Đã từ chối', tone: 'neutral' },
  expired: { label: 'Hết hạn', tone: 'neutral' },
};

export function statusInfo(status: string): { label: string; tone: Tone } {
  return AGENT_ACTION_STATUS[status] ?? { label: status, tone: 'neutral' };
}

/** Phiếu còn chờ duyệt và chưa quá hạn (máy chủ vẫn kiểm lại khi bấm). */
export function isActionable(action: Pick<AgentActionView, 'status' | 'expiresAt'>, now: number = Date.now()): boolean {
  return action.status === 'pending' && new Date(action.expiresAt).getTime() > now;
}

/** "Còn 2 giờ 5 phút" / "Còn 40 phút" / "Còn dưới 1 phút" / "Đã hết hạn". */
export function timeLeftText(expiresAt: string, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms)) return '';
  if (ms <= 0) return 'Đã hết hạn';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'Còn dưới 1 phút';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return hours > 0 ? `Còn ${days} ngày ${hours} giờ` : `Còn ${days} ngày`;
  if (hours > 0) return mins > 0 ? `Còn ${hours} giờ ${mins} phút` : `Còn ${hours} giờ`;
  return `Còn ${mins} phút`;
}

/** Sắp hết hạn (dưới 15 phút) — tô màu cảnh báo. */
export function isExpiringSoon(expiresAt: string, now: number = Date.now()): boolean {
  const ms = new Date(expiresAt).getTime() - now;
  return ms > 0 && ms < 15 * 60_000;
}

/** Lệnh HTTP → việc agent định làm, để người duyệt đọc nhanh. */
export function methodLabel(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'Tạo / gửi';
    case 'PUT':
    case 'PATCH':
      return 'Sửa';
    case 'DELETE':
      return 'Xoá';
    default:
      return method.toUpperCase();
  }
}

export type ActionParam = { key: string; value: string };

/** Tối đa số dòng tham số hiện ra; còn lại gộp thành một dòng "… và n tham số nữa". */
export const MAX_PARAMS = 40;
const MAX_VALUE_CHARS = 300;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (typeof value === 'string') {
    if (value === '') return '(trống)';
    return value.length > MAX_VALUE_CHARS ? `${value.slice(0, MAX_VALUE_CHARS - 1)}…` : value;
  }
  return String(value);
}

function flatten(value: unknown, prefix: string, out: ActionParam[]) {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.push({ key: prefix || '(danh sách)', value: '(trống)' });
      return;
    }
    // Danh sách giá trị đơn: một dòng, nối bằng dấu phẩy.
    if (value.every((v) => v === null || typeof v !== 'object')) {
      out.push({ key: prefix || '(danh sách)', value: formatValue(value.map(formatValue).join(', ')) });
      return;
    }
    value.forEach((item, i) => flatten(item, `${prefix}[${i + 1}]`, out));
    return;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      out.push({ key: prefix || '(đối tượng)', value: '(trống)' });
      return;
    }
    for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  out.push({ key: prefix || 'Giá trị', value: formatValue(value) });
}

/**
 * Tham số của lệnh từ bodyJson, dạng từng dòng "khoá: giá trị" (đối tượng lồng nhau → "a.b", danh sách → "items[1].x").
 * Không có body → []. Không phải JSON → null (màn hiện nguyên văn).
 */
export function actionParams(bodyJson: string | null | undefined): ActionParam[] | null {
  if (bodyJson === null || bodyJson === undefined || bodyJson.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyJson);
  } catch {
    return null;
  }
  const out: ActionParam[] = [];
  flatten(parsed, '', out);
  if (out.length > MAX_PARAMS) {
    const rest = out.length - (MAX_PARAMS - 1);
    return [...out.slice(0, MAX_PARAMS - 1), { key: '…', value: `và ${rest} tham số nữa` }];
  }
  return out;
}

/** Chạy xong và API trả 2xx. */
export function isResultSuccess(action: Pick<AgentActionView, 'status' | 'resultStatusCode'>): boolean {
  const code = action.resultStatusCode;
  return action.status === 'executed' && (code === null || code === undefined || (code >= 200 && code < 300));
}

/** Câu ngắn từ kết quả chạy: lấy message / detail / title của JSON lỗi nếu có, không thì nguyên văn (cắt bớt). */
export function resultMessage(resultBody: string | null | undefined, max = 600): string {
  const raw = (resultBody ?? '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const o = parsed as Record<string, unknown>;
      if (o.errors && typeof o.errors === 'object' && !Array.isArray(o.errors)) {
        const first = Object.values(o.errors as Record<string, unknown>)[0];
        const msg = Array.isArray(first) ? first[0] : first;
        if (typeof msg === 'string' && msg) return msg;
      }
      for (const k of ['message', 'detail', 'description', 'title', 'error']) {
        if (typeof o[k] === 'string' && o[k]) return o[k] as string;
      }
    }
  } catch {
    // Không phải JSON — dùng nguyên văn.
  }
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

/** Màn chi tiết phiếu trong app. */
export function agentActionRoute(id: string): string {
  return `/agent/approvals/${id}`;
}
