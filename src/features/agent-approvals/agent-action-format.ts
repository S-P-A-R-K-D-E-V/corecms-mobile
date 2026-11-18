import type { AgentActionView, AgentPreviewChannel, AgentSocialPostPreview } from 'src/api/agent-actions';

// ----------------------------------------------------------------------
// Phần thuần của màn Duyệt việc agent (test được): nhãn trạng thái, thời gian còn lại, tham số của lệnh từ bodyJson,
// kết quả chạy sau khi duyệt, bản xem trước (tiêu đề, bài mạng xã hội), vòng "Yêu cầu sửa".
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
  revision_requested: { label: 'Đã yêu cầu sửa', tone: 'secondary' },
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

// ----------------------------------------------------------------------
// Bản xem trước (BE dựng sẵn `title` / `preview`; BE cũ không có → quay về summary).
// ----------------------------------------------------------------------

/** "\\uD83E\\uDD14" còn sót dạng thoát trong chuỗi → ký tự thật (cặp surrogate ghép lại thành emoji 🤔). */
export function decodeUnicodeEscapes(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Tên việc agent xin làm: `title` → `preview.title` → summary (giải mã emoji) → "Tạo / gửi POST /path". */
export function actionTitle(
  action: Pick<AgentActionView, 'title' | 'preview' | 'summary' | 'method' | 'pathAndQuery'>,
): string {
  const title = action.title?.trim() || action.preview?.title?.trim();
  if (title) return title;
  const summary = action.summary?.trim();
  if (summary) return decodeUnicodeEscapes(summary);
  return `${methodLabel(action.method)} ${action.pathAndQuery}`;
}

/** Bài mạng xã hội của phiếu (preview kind social_post), không có → null. */
export function socialPostOf(action: Pick<AgentActionView, 'preview'> | null | undefined): AgentSocialPostPreview | null {
  const preview = action?.preview;
  return preview?.kind === 'social_post' && preview.socialPost ? preview.socialPost : null;
}

/** Một dòng trích caption: gộp xuống dòng / khoảng trắng, cắt ở `max` ký tự (không cắt đôi emoji). */
export function captionExcerpt(text: string | null | undefined, max = 120): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(flat);
  if (chars.length <= max) return flat;
  return `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

/** "Bản 2" khi phiếu là bản sửa (version > 1); bản đầu → null (không hiện). */
export function versionLabel(version: number | null | undefined): string | null {
  return typeof version === 'number' && version > 1 ? `Bản ${version}` : null;
}

const PLATFORM_LABEL: Record<string, string> = {
  threads: 'Threads',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  zalo: 'Zalo',
  youtube: 'YouTube',
  x: 'X',
  twitter: 'X',
};

export function platformLabel(platform: string | null | undefined): string {
  const key = (platform ?? '').trim().toLowerCase();
  if (!key) return '';
  return PLATFORM_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Dòng phụ dưới tên kênh: "@cici.store · Threads" / "Threads". */
export function channelHandle(channel: Pick<AgentPreviewChannel, 'username' | 'platform'>): string {
  const user = channel.username?.trim().replace(/^@+/, '');
  const platform = platformLabel(channel.platform);
  return [user ? `@${user}` : '', platform].filter(Boolean).join(' · ');
}

// ----------------------------------------------------------------------
// Vòng "Yêu cầu sửa".
// ----------------------------------------------------------------------

/** Chip ghi chú nhanh ở hộp Yêu cầu sửa — bấm là nối vào ghi chú. */
export const REVISION_QUICK_NOTES = ['Ảnh đẹp / sáng hơn', 'Đổi nền khác', 'Viết ngắn lại', 'Giọng vui hơn', 'Đổi giờ đăng'] as const;

/** Nối một chip vào ghi chú (mỗi ý một dòng); đã có rồi thì giữ nguyên. */
export function appendQuickNote(note: string, chip: string): string {
  const trimmed = note.trimEnd();
  if (!trimmed) return chip;
  if (trimmed.split('\n').some((line) => line.trim() === chip)) return note;
  return `${trimmed}\n${chip}`;
}

/** Còn được Yêu cầu sửa không: null = không giới hạn theo việc; 0 = hết lượt. */
export function canRequestRevision(action: Pick<AgentActionView, 'revisionsLeft'>): boolean {
  const left = action.revisionsLeft;
  return left === null || left === undefined || left > 0;
}

/** "Còn 2 lần yêu cầu sửa" / "Đã hết lượt yêu cầu sửa"; không giới hạn → ''. */
export function revisionsLeftText(left: number | null | undefined): string {
  if (left === null || left === undefined) return '';
  return left > 0 ? `Còn ${left} lần yêu cầu sửa` : 'Đã hết lượt yêu cầu sửa';
}

/** Gửi được khi có ghi chú hoặc ít nhất một ảnh cần làm lại. */
export function canSubmitRevision(note: string, imageUrls: readonly string[]): boolean {
  return note.trim().length > 0 || imageUrls.length > 0;
}

const REDO_MARKER = 'Ảnh cần làm lại:';

/**
 * Ghi chú của phiếu bị Yêu cầu sửa (BE ghép: ghi chú + "Ảnh cần làm lại:" + "- url" từng dòng) → phần chữ và danh sách ảnh,
 * để hiện ảnh thay vì in URL.
 */
export function splitRevisionNote(note: string | null | undefined): { text: string; imageUrls: string[] } {
  const raw = note ?? '';
  const at = raw.indexOf(REDO_MARKER);
  if (at < 0) return { text: raw.trim(), imageUrls: [] };
  const imageUrls = raw
    .slice(at + REDO_MARKER.length)
    .split('\n')
    .map((line) => line.trim().replace(/^-\s*/, '').trim())
    .filter((line) => /^https?:\/\//i.test(line));
  return { text: raw.slice(0, at).trim(), imageUrls };
}
