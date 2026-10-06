import { createStore, useStore } from 'zustand';

import axios from 'src/api/axios';
import { prefs, PrefKeys } from 'src/services/storage';

import type { DraftLine } from './draft';
import { FnbCodes, readProblem, type FnbProblem } from './fnb-errors';

// ----------------------------------------------------------------------
// Hàng đợi lệnh ghi F&B (contract 8.1) — MỌI lệnh ghi lên đơn / phiếu bar đi qua đây, không gọi axios trực tiếp.
//   - Lệnh được ghi xuống máy (AsyncStorage theo cửa hàng) TRƯỚC khi gửi; một mục = đúng yêu cầu: method, path,
//     body gồm clientRequestId, các id do máy sinh, deviceId, clientTime.
//   - Theo từng đơn: gửi lần lượt (FIFO). Lệnh chạm hai đơn (chuyển món) chiếm hàng của cả hai đơn. Đơn khác nhau
//     gửi song song.
//   - Không có trả lời / hết 15 giây / 5xx → gửi lại ĐÚNG mục đó (cùng clientRequestId, cùng body), lùi dần
//     1-2-4-8-16-30 giây, kể cả sau khi tắt mở app.
//   - 2xx → bỏ khỏi hàng, báo kết quả (đơn / phiếu mới) cho nơi lưu.
//   - 409 OpenOrder.VersionConflict → bỏ mục, tải lại đơn (đơn trong phản hồi); người dùng làm lại thao tác.
//   - 4xx khác → mục đó + mọi mục sau của cùng đơn chuyển sang "cần xử lý" (không bao giờ tự bỏ, không gửi lại
//     nguyên xi). Gặp 409 thì vẫn tải lại đơn.
// ----------------------------------------------------------------------

export const FNB_WRITE_TIMEOUT_MS = 15_000;

export type FnbCommandKind =
  | 'open'
  | 'info'
  | 'addLines'
  | 'replaceLine'
  | 'send'
  | 'void'
  | 'move'
  | 'bill'
  | 'checkout'
  | 'cancel'
  | 'printResult';

export type QueueInput = {
  kind: FnbCommandKind;
  /** Các đơn lệnh này chạm tới; phần tử đầu là đơn chính (đơn nguồn khi chuyển món). */
  orderIds: string[];
  method: 'PUT' | 'POST';
  path: string;
  /** Có `clientRequestId` — cũng là khoá của mục. */
  body: { clientRequestId: string } & Record<string, unknown>;
  /**
   * Chỉ dùng trên máy, không gửi lên máy chủ: các món của lệnh thêm món để hiện "đang gửi" và để trả lại thành món
   * đang chọn khi người dùng bỏ lệnh bị từ chối.
   */
  preview?: { drafts: DraftLine[] };
};

export type QueueEntryState = 'queued' | 'attention';

export type QueueEntry = QueueInput & {
  id: string;
  seq: number;
  createdAt: number;
  attempts: number;
  /** Chưa tới lúc này thì chưa gửi lại (ms). */
  nextAttemptAt: number;
  state: QueueEntryState;
  /** Lý do "cần xử lý" (mục bị từ chối, hoặc mục đứng sau một mục bị từ chối). */
  error?: { status: number | null; code: string | null; title: string | null; blockedBy?: string };
};

export type QueueHttpResult = { status: number | null; data: unknown };

export type SettleOutcome =
  | { kind: 'done'; data: unknown }
  | { kind: 'retry' }
  | { kind: 'conflict'; problem: FnbProblem }
  | { kind: 'attention'; problem: FnbProblem; status: number };

// ── Phần thuần ──────────────────────────────────────────────────────────

const RETRY_STEPS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

/** Thời gian chờ trước lần gửi lại thứ `attempts` (đã thất bại `attempts` lần). */
export function backoffMs(attempts: number): number {
  return RETRY_STEPS_MS[Math.min(Math.max(attempts, 1), RETRY_STEPS_MS.length) - 1]!;
}

const sharesLane = (a: QueueEntry, b: QueueEntry) => a.orderIds.some((id) => b.orderIds.includes(id));

/** Mục đứng đầu mọi hàng đơn của nó (không mục nào trước nó chạm cùng đơn) và đã tới giờ gửi. */
export function isReady(entries: readonly QueueEntry[], entry: QueueEntry, now: number): boolean {
  if (entry.state !== 'queued' || entry.nextAttemptAt > now) return false;
  return !entries.some((e) => e.seq < entry.seq && sharesLane(e, entry));
}

export function readyEntries(entries: readonly QueueEntry[], now: number): QueueEntry[] {
  return entries.filter((e) => isReady(entries, e, now));
}

/** Lần sớm nhất cần thử lại một mục đang chờ lùi giờ; không có thì null. */
export function nextWakeAt(entries: readonly QueueEntry[], now: number): number | null {
  let at: number | null = null;
  for (const e of entries) {
    if (e.state !== 'queued' || e.nextAttemptAt <= now) continue;
    if (!entries.some((x) => x.seq < e.seq && sharesLane(x, e))) at = at === null ? e.nextAttemptAt : Math.min(at, e.nextAttemptAt);
  }
  return at;
}

export function appendEntry(entries: readonly QueueEntry[], input: QueueInput, now: number): QueueEntry[] {
  if (entries.some((e) => e.id === input.body.clientRequestId)) return [...entries];
  const seq = entries.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
  return [
    ...entries,
    { ...input, id: input.body.clientRequestId, seq, createdAt: now, attempts: 0, nextAttemptAt: 0, state: 'queued' },
  ];
}

/** Phân loại một lần gửi (contract 8.1). */
export function classify(result: QueueHttpResult): SettleOutcome {
  const { status } = result;
  if (status === null || status >= 500 || status === 408 || status === 429) return { kind: 'retry' };
  if (status >= 200 && status < 300) return { kind: 'done', data: result.data };
  const problem = readProblem(result.data);
  if (status === 409 && problem.code === FnbCodes.versionConflict) return { kind: 'conflict', problem };
  return { kind: 'attention', problem, status };
}

/** Áp kết quả của mục `id` vào hàng đợi. */
export function settleEntries(entries: readonly QueueEntry[], id: string, outcome: SettleOutcome, now: number): QueueEntry[] {
  const entry = entries.find((e) => e.id === id);
  if (!entry) return [...entries];
  switch (outcome.kind) {
    case 'done':
    case 'conflict':
      return entries.filter((e) => e.id !== id);
    case 'retry': {
      const attempts = entry.attempts + 1;
      return entries.map((e) => (e.id === id ? { ...e, attempts, nextAttemptAt: now + backoffMs(attempts) } : e));
    }
    case 'attention': {
      // Mục bị từ chối + mọi mục sau nó chạm cùng đơn (lan theo chuỗi đơn) → "cần xử lý".
      const blocked = new Set<string>([id]);
      const lanes = new Set(entry.orderIds);
      for (const e of [...entries].sort((a, b) => a.seq - b.seq)) {
        if (e.seq <= entry.seq || !e.orderIds.some((o) => lanes.has(o))) continue;
        blocked.add(e.id);
        e.orderIds.forEach((o) => lanes.add(o));
      }
      const { code, title } = outcome.problem;
      return entries.map((e) => {
        if (!blocked.has(e.id)) return e;
        return e.id === id
          ? { ...e, state: 'attention' as const, error: { status: outcome.status, code, title } }
          : { ...e, state: 'attention' as const, error: { status: null, code: null, title: null, blockedBy: id } };
      });
    }
    default:
      return [...entries];
  }
}

/** Người dùng bỏ các mục "cần xử lý" của một đơn (sau đó đơn được tải lại từ máy chủ). */
export function discardAttention(entries: readonly QueueEntry[], orderId: string): QueueEntry[] {
  return entries.filter((e) => !(e.state === 'attention' && e.orderIds.includes(orderId)));
}

/** Đơn còn lệnh chưa gửi xong (đang chờ hoặc cần xử lý). */
export function hasEntriesFor(entries: readonly QueueEntry[], orderId: string): boolean {
  return entries.some((e) => e.orderIds.includes(orderId));
}

/** Đọc hàng đợi đã lưu; hỏng / sai dạng → rỗng. Mục đang gửi dở lúc app bị tắt được gửi lại ngay. */
export function parseStoredQueue(raw: string | null | undefined): QueueEntry[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (e): e is QueueEntry =>
          !!e &&
          typeof e === 'object' &&
          typeof e.id === 'string' &&
          typeof e.seq === 'number' &&
          typeof e.path === 'string' &&
          (e.method === 'PUT' || e.method === 'POST') &&
          Array.isArray(e.orderIds) &&
          !!e.body &&
          e.body.clientRequestId === e.id
      )
      .map((e): QueueEntry => ({ ...e, nextAttemptAt: 0, state: e.state === 'attention' ? 'attention' : 'queued' }))
      .sort((a, b) => a.seq - b.seq);
  } catch {
    return [];
  }
}

// ── Phần chạy ───────────────────────────────────────────────────────────

export type QueueHandlers = {
  /** 2xx: dữ liệu trả về (OrderCommandResult / { ticket }). */
  onDone?: (entry: QueueEntry, data: unknown) => void;
  /** 409 (xung đột phiên bản hoặc 409 khác): tải lại đơn — `problem.order` có thì dùng luôn. */
  onConflict?: (entry: QueueEntry, problem: FnbProblem) => void;
  /** 4xx khác: mục chuyển sang "cần xử lý". */
  onAttention?: (entry: QueueEntry, problem: FnbProblem, status: number) => void;
};

export type QueueDeps = {
  transport: (entry: QueueEntry, timeoutMs: number) => Promise<QueueHttpResult>;
  storage: { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void> };
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export type QueueState = { scope: string | null; hydrated: boolean; entries: QueueEntry[] };

export const queueKey = (scope: string) => `${PrefKeys.fnbQueue}.${scope}`;

/** Gửi một mục bằng axios chung (token, gốc API theo cửa hàng). Không ném lỗi. */
export async function axiosTransport(entry: QueueEntry, timeoutMs: number): Promise<QueueHttpResult> {
  try {
    const res = await axios.request<unknown>({
      method: entry.method,
      url: entry.path,
      data: entry.body,
      timeout: timeoutMs,
      // 4xx về như phản hồi thường để phân loại; 401 vẫn đi đường lỗi để axios khôi phục phiên rồi gửi lại.
      validateStatus: (status) => status !== 401 && status < 500,
    });
    return { status: res.status, data: res.data };
  } catch (error) {
    return { status: null, data: error };
  }
}

export function createWriteQueue(deps: QueueDeps) {
  const store = createStore<QueueState>(() => ({ scope: null, hydrated: false, entries: [] }));
  let handlers: QueueHandlers = {};
  const inFlight = new Set<string>();
  let timer: unknown = null;
  let saving: Promise<void> = Promise.resolve();

  function persist(): Promise<void> {
    const { scope, entries } = store.getState();
    if (!scope) return saving;
    const raw = JSON.stringify(entries);
    // Ghi nối tiếp để bản cũ không đè bản mới.
    saving = saving.then(() => deps.storage.set(queueKey(scope), raw)).catch(() => {});
    return saving;
  }

  function schedule() {
    if (timer !== null) deps.clearTimer(timer);
    timer = null;
    const at = nextWakeAt(store.getState().entries, deps.now());
    if (at !== null) timer = deps.setTimer(() => { timer = null; kick(); }, Math.max(0, at - deps.now()));
  }

  async function sendOne(entry: QueueEntry, scope: string) {
    inFlight.add(entry.id);
    let result: QueueHttpResult;
    try {
      result = await deps.transport(entry, FNB_WRITE_TIMEOUT_MS);
    } catch (error) {
      result = { status: null, data: error };
    } finally {
      inFlight.delete(entry.id);
    }
    // Đã sang cửa hàng khác trong lúc gửi: mục vẫn nằm trong bản lưu của cửa hàng cũ, lần sau gửi lại (an toàn
    // nhờ clientRequestId).
    if (store.getState().scope !== scope) return;
    const outcome = classify(result);
    store.setState({ entries: settleEntries(store.getState().entries, entry.id, outcome, deps.now()) });
    await persist();
    try {
      if (outcome.kind === 'done') handlers.onDone?.(entry, outcome.data);
      else if (outcome.kind === 'conflict') handlers.onConflict?.(entry, outcome.problem);
      else if (outcome.kind === 'attention') {
        handlers.onAttention?.(entry, outcome.problem, outcome.status);
        if (outcome.status === 409) handlers.onConflict?.(entry, outcome.problem);
      }
    } catch {
      // Lỗi ở nơi nhận kết quả không được làm kẹt hàng đợi.
    }
    kick();
  }

  function kick() {
    const { scope, hydrated, entries } = store.getState();
    if (!scope || !hydrated) return;
    for (const entry of readyEntries(entries, deps.now())) {
      if (!inFlight.has(entry.id)) void sendOne(entry, scope);
    }
    schedule();
  }

  return {
    store,

    setHandlers(next: QueueHandlers) {
      handlers = next;
    },

    /** Nạp hàng đợi đã lưu của cửa hàng `scope` rồi gửi tiếp. Không bao giờ ném lỗi. */
    async hydrate(scope: string) {
      const s = store.getState();
      if (s.scope === scope && s.hydrated) return;
      store.setState({ scope, hydrated: false, entries: [] });
      let entries: QueueEntry[] = [];
      try {
        entries = parseStoredQueue(await deps.storage.get(queueKey(scope)));
      } catch {
        // Không đọc được → hàng rỗng.
      }
      if (store.getState().scope !== scope) return;
      store.setState({ entries, hydrated: true });
      kick();
    },

    /** Ngừng gửi (đổi cửa hàng / đăng xuất). Bản lưu giữ nguyên để lần sau gửi tiếp. */
    unload() {
      if (timer !== null) deps.clearTimer(timer);
      timer = null;
      store.setState({ scope: null, hydrated: false, entries: [] });
    },

    /** Xếp một lệnh: ghi xuống máy rồi mới gửi. Trả về id mục (= clientRequestId). */
    async enqueue(input: QueueInput): Promise<string> {
      store.setState({ entries: appendEntry(store.getState().entries, input, deps.now()) });
      await persist();
      kick();
      return input.body.clientRequestId;
    },

    /** Bỏ các mục "cần xử lý" của đơn (người dùng đã xem lỗi). */
    async discard(orderId: string) {
      store.setState({ entries: discardAttention(store.getState().entries, orderId) });
      await persist();
      kick();
    },

    /** Gửi lại ngay các mục đang chờ lùi giờ (vd app quay lại foreground). */
    retryNow() {
      const now = deps.now();
      store.setState({
        entries: store.getState().entries.map((e) => (e.state === 'queued' && e.nextAttemptAt > now ? { ...e, nextAttemptAt: now } : e)),
      });
      kick();
    },

    kick,
  };
}

export type WriteQueue = ReturnType<typeof createWriteQueue>;

/** Hàng đợi dùng chung của app. */
export const fnbQueue = createWriteQueue({
  transport: axiosTransport,
  storage: { get: prefs.get, set: prefs.set },
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
});

export function useFnbQueue<T>(selector: (s: QueueState) => T): T {
  return useStore(fnbQueue.store, selector);
}
