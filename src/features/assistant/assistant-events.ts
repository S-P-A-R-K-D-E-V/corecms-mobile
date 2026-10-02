import type { AssistantMessage, AssistantStep } from 'src/api/assistant';
import type { AssistantHubEvent } from 'src/components/assistant/assistant-provider';

// ----------------------------------------------------------------------
// Hàm thuần cho state tin nhắn màn Trợ lý (contract ASSISTANT CHAT v1 §5) — tách khỏi component để test:
//   - reduceAssistantEvent: áp một sự kiện SignalR vào danh sách tin.
//   - mergeServerMessages: gộp danh sách tải lại từ REST (watchdog / kết nối lại) vào state đang có.
//   - expireStalePending: tin chờ quá lâu → lỗi (cho phép Thử lại), không quay mãi.
// Server cũ không gửi step/v/status/blocks → mọi nhánh đều phải chạy được chỉ với văn bản.
// ----------------------------------------------------------------------

export type ScreenMessage = AssistantMessage & {
  /** Đang nhận câu trả lời (chờ / đang stream). */
  streaming?: boolean;
  /** Nhãn tạm (đang suy nghĩ / công cụ ở server cũ) — không lưu. */
  statusLabel?: string;
  /** Thời điểm (máy) bắt đầu chờ câu trả lời — để watchdog đánh lỗi khi quá lâu. */
  pendingSince?: number;
  /** Ảnh đính kèm của tin người dùng vừa gửi (uri trên máy) — hiện ngay, không chờ server. */
  localUris?: string[];
};

/** Id tin người dùng tạm (chưa có id server). */
export const LOCAL_ID_PREFIX = 'local-';

export function isOptimistic(m: { id: string }): boolean {
  return m.id.startsWith(LOCAL_ID_PREFIX);
}

/** Trạng thái thực của tin — tin cũ (không có status) có nội dung = complete, rỗng = vẫn chờ. */
export function effectiveStatus(m: AssistantMessage): 'pending' | 'complete' | 'error' {
  if (m.status === 'pending' || m.status === 'complete' || m.status === 'error') return m.status;
  if (m.role !== 'assistant') return 'complete';
  return m.content ? 'complete' : 'pending';
}

/** Tin trợ lý còn đang chờ / stream (watchdog theo dõi). */
export function isInFlight(m: ScreenMessage): boolean {
  return m.role === 'assistant' && (!!m.streaming || m.status === 'pending');
}

function finalizeSteps(steps: AssistantStep[] | null | undefined, to: 'done' | 'error'): AssistantStep[] | undefined {
  if (!steps || steps.length === 0) return undefined;
  return steps.map((s) => (s.state === 'running' ? { ...s, state: to } : s));
}

function upsertStep(steps: AssistantStep[] | null | undefined, step: AssistantStep): AssistantStep[] {
  const list = steps ?? [];
  const idx = list.findIndex((s) => s.id === step.id);
  if (idx === -1) return [...list, step];
  const next = [...list];
  next[idx] = { ...next[idx], ...step };
  return next;
}

function newAssistant(messageId: string, now: number): ScreenMessage {
  return {
    id: messageId,
    role: 'assistant',
    content: '',
    createdAt: new Date(now).toISOString(),
    status: 'pending',
    streaming: true,
    pendingSince: now,
  };
}

/** Sửa (hoặc tạo nếu chưa có — vd join muộn, lỡ streamingStarted) tin trợ lý theo id. */
function patchAssistant(
  messages: ScreenMessage[],
  messageId: string,
  now: number,
  patch: (m: ScreenMessage) => ScreenMessage
): ScreenMessage[] {
  const idx = messages.findIndex((m) => m.id === messageId);
  if (idx === -1) return [...messages, patch(newAssistant(messageId, now))];
  const next = [...messages];
  next[idx] = patch(next[idx]!);
  return next;
}

/** Áp một sự kiện hub vào danh sách tin (đã lọc đúng phiên). Không đổi gì → trả lại đúng mảng cũ. */
export function reduceAssistantEvent(messages: ScreenMessage[], ev: AssistantHubEvent, now = Date.now()): ScreenMessage[] {
  switch (ev.type) {
    case 'streamingStarted':
      // Thử lại dùng lại đúng id tin → xoá phần trả lời / lỗi cũ.
      return patchAssistant(messages, ev.messageId, now, (m) => ({
        ...m,
        content: '',
        status: 'pending',
        errorCode: null,
        blocks: null,
        steps: null,
        streaming: true,
        statusLabel: undefined,
        pendingSince: m.streaming && m.pendingSince ? m.pendingSince : now,
      }));

    case 'chunk':
      if (!ev.content) return messages;
      return patchAssistant(messages, ev.messageId, now, (m) => ({
        ...m,
        content: (m.content || '') + ev.content,
        streaming: true,
        statusLabel: undefined,
      }));

    case 'step':
      return patchAssistant(messages, ev.messageId, now, (m) => ({
        ...m,
        steps: upsertStep(m.steps, ev.step),
        streaming: m.status === 'complete' || m.status === 'error' ? m.streaming : true,
      }));

    case 'status': {
      const msg = messages.find((m) => m.id === ev.messageId);
      // Đã có bước (server mới) → status công cụ chỉ dành cho app cũ, bỏ qua.
      if (ev.kind === 'tool' && msg?.steps && msg.steps.length > 0) return messages;
      // Tin đã xong / lỗi → nhãn tạm không còn ý nghĩa.
      if (msg && !msg.streaming) return messages;
      const label = ev.phase === 'end' ? undefined : ev.label || ev.name || undefined;
      return patchAssistant(messages, ev.messageId, now, (m) => ({ ...m, statusLabel: label }));
    }

    case 'completed':
      return patchAssistant(messages, ev.messageId, now, (m) => ({
        ...m,
        // content đã bỏ khối spark-ui và là bản chính thức.
        content: ev.content ?? m.content,
        fromCache: ev.fromCache ?? m.fromCache,
        v: ev.v ?? m.v,
        status: 'complete',
        errorCode: null,
        blocks: Array.isArray(ev.blocks) ? ev.blocks : m.blocks ?? null,
        steps: finalizeSteps(Array.isArray(ev.steps) ? ev.steps : m.steps, 'done') ?? null,
        streaming: false,
        statusLabel: undefined,
        pendingSince: undefined,
      }));

    case 'error':
      return patchAssistant(messages, ev.messageId, now, (m) => ({
        ...m,
        // Giữ phần đã trả lời: server gửi partial (bản chính thức), server cũ không gửi → giữ phần đã stream.
        content: ev.partial ?? m.content ?? '',
        status: 'error',
        errorCode: ev.code ?? 'internal',
        steps: finalizeSteps(m.steps, 'error') ?? null,
        streaming: false,
        statusLabel: undefined,
        pendingSince: undefined,
      }));

    default:
      return messages;
  }
}

/** Đổi tin tạm (local-…) sang id server sau khi POST xong — giữ ảnh trên máy để không nháy. */
export function confirmOptimistic(messages: ScreenMessage[], localId: string, serverId: string): ScreenMessage[] {
  if (messages.some((m) => m.id === serverId)) return messages.filter((m) => m.id !== localId);
  return messages.map((m) => (m.id === localId ? { ...m, id: serverId } : m));
}

function fromServer(s: AssistantMessage, local?: ScreenMessage): ScreenMessage {
  const status = effectiveStatus(s);
  const pending = s.role === 'assistant' && status === 'pending';
  return {
    ...s,
    status,
    streaming: pending,
    statusLabel: pending ? local?.statusLabel : undefined,
    // Chưa từng thấy trên máy → tính từ lúc server tạo chỗ chờ (để watchdog vẫn hết giờ được).
    pendingSince: pending ? local?.pendingSince ?? (Date.parse(s.createdAt) || undefined) : undefined,
    localUris: local?.localUris,
  };
}

/**
 * Gộp danh sách REST vào state hiện có:
 *   - id server đã xong (complete/error) → bản server thắng (đủ blocks/steps, không còn quay).
 *   - id server còn chờ mà máy đã có → giữ bản máy (đang stream, nhiều thông tin hơn).
 *   - id chỉ có ở server → thêm vào (lỡ sự kiện lúc chưa join / rớt mạng).
 *   - tin chỉ có ở máy → giữ (tin cũ ngoài `limit`, tin người dùng đang gửi, chỗ chờ trả lời).
 * Thứ tự theo createdAt; tin tạm (chưa có id server) luôn ở cuối.
 */
export function mergeServerMessages(local: ScreenMessage[], server: AssistantMessage[]): ScreenMessage[] {
  const serverById = new Map(server.map((s) => [s.id, s]));
  const localIds = new Set(local.map((m) => m.id));

  const merged: ScreenMessage[] = local.map((m) => {
    const s = serverById.get(m.id);
    if (!s) return m;
    const st = effectiveStatus(s);
    if (st === 'pending' && m.role === 'assistant') {
      // Server còn chờ: máy đã lỗi (watchdog hết giờ) hay đang stream → giữ bản máy.
      return m.streaming || m.status === 'error' ? m : fromServer(s, m);
    }
    return fromServer(s, m);
  });
  for (const s of server) if (!localIds.has(s.id)) merged.push(fromServer(s));

  const confirmed = merged
    .map((m, i) => ({ m, i, t: Date.parse(m.createdAt) || 0 }))
    .filter((x) => !isOptimistic(x.m))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.m);
  return [...confirmed, ...merged.filter(isOptimistic)];
}

/** Tin chờ quá `maxMs` (không có sự kiện kết thúc, REST cũng chưa xong) → lỗi timeout, cho Thử lại. */
export function expireStalePending(messages: ScreenMessage[], now: number, maxMs: number): ScreenMessage[] {
  let changed = false;
  const next = messages.map((m) => {
    if (!isInFlight(m) || !m.pendingSince || now - m.pendingSince < maxMs) return m;
    changed = true;
    return {
      ...m,
      status: 'error' as const,
      errorCode: 'timeout',
      steps: finalizeSteps(m.steps, 'error') ?? null,
      streaming: false,
      statusLabel: undefined,
      pendingSince: undefined,
    };
  });
  return changed ? next : messages;
}
