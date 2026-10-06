import {
  appendEntry,
  backoffMs,
  classify,
  createWriteQueue,
  discardAttention,
  isReady,
  nextWakeAt,
  parseStoredQueue,
  queueKey,
  readyEntries,
  settleEntries,
  type QueueEntry,
  type QueueHttpResult,
  type QueueInput,
} from '../write-queue';

jest.mock('src/api/axios', () => ({ __esModule: true, default: { request: jest.fn() }, endpoints: {} }));

const input = (id: string, orderIds: string[], kind: QueueInput['kind'] = 'addLines'): QueueInput => ({
  kind,
  orderIds,
  method: 'POST',
  path: `/fnb/orders/${orderIds[0]}/lines`,
  body: { clientRequestId: id, deviceId: 'dev', clientTime: '2026-10-06T08:00:00.000Z' },
});

function build(...items: QueueInput[]): QueueEntry[] {
  return items.reduce<QueueEntry[]>((acc, i) => appendEntry(acc, i, 0), []);
}

const problem409 = (code: string, extra: object = {}) => ({ status: 409, data: { title: 'xung đột', errorCodes: [code], ...extra } });

describe('hàng đợi — phần thuần', () => {
  it('FIFO theo đơn: chỉ mục đầu của mỗi đơn được gửi, đơn khác gửi song song', () => {
    const q = build(input('a1', ['A']), input('a2', ['A']), input('b1', ['B']));
    expect(readyEntries(q, 0).map((e) => e.id)).toEqual(['a1', 'b1']);
  });

  it('lệnh chuyển món chiếm hàng của cả hai đơn', () => {
    const q = build(input('b1', ['B']), input('m', ['A', 'B'], 'move'), input('a2', ['A']));
    expect(readyEntries(q, 0).map((e) => e.id)).toEqual(['b1']);
    const after = settleEntries(q, 'b1', { kind: 'done', data: {} }, 0);
    expect(readyEntries(after, 0).map((e) => e.id)).toEqual(['m']);
  });

  it('không thêm trùng cùng clientRequestId', () => {
    const q = build(input('a1', ['A']), input('a1', ['A']));
    expect(q).toHaveLength(1);
  });

  it('phân loại phản hồi theo contract 8.1', () => {
    expect(classify({ status: null, data: null }).kind).toBe('retry');
    expect(classify({ status: 503, data: null }).kind).toBe('retry');
    expect(classify({ status: 200, data: { order: {} } }).kind).toBe('done');
    expect(classify(problem409('OpenOrder.VersionConflict')).kind).toBe('conflict');
    expect(classify(problem409('OpenOrder.NotOpen')).kind).toBe('attention');
    expect(classify({ status: 400, data: { errorCodes: ['OpenOrder.ReasonRequired'] } }).kind).toBe('attention');
    expect(classify({ status: 403, data: { errorCodes: ['OpenOrder.ManagerRequired'], title: 'Cần quản lý' } })).toMatchObject({
      kind: 'attention',
      status: 403,
      problem: { code: 'OpenOrder.ManagerRequired', title: 'Cần quản lý' },
    });
  });

  it('lỗi mạng: giữ mục, tăng số lần, lùi giờ 1-2-4…30 giây', () => {
    let q = build(input('a1', ['A']));
    q = settleEntries(q, 'a1', { kind: 'retry' }, 1000);
    expect(q[0]).toMatchObject({ attempts: 1, nextAttemptAt: 2000, state: 'queued' });
    expect(isReady(q, q[0]!, 1999)).toBe(false);
    expect(isReady(q, q[0]!, 2000)).toBe(true);
    expect(nextWakeAt(q, 1000)).toBe(2000);
    expect([1, 2, 3, 6, 50].map(backoffMs)).toEqual([1000, 2000, 4000, 30000, 30000]);
  });

  it('4xx: mục bị từ chối và mọi mục sau của cùng đơn (lan qua lệnh chuyển) chuyển sang "cần xử lý"', () => {
    const q = build(input('a1', ['A']), input('b1', ['B']), input('m', ['A', 'C'], 'move'), input('c1', ['C']), input('b2', ['B']));
    const out = settleEntries(q, 'a1', { kind: 'attention', status: 400, problem: { code: 'X', title: 'Sai', order: null, otherOrder: null, ticket: null, openOrderIds: [], productIds: [] } }, 0);
    const state = Object.fromEntries(out.map((e) => [e.id, e.state]));
    expect(state).toEqual({ a1: 'attention', b1: 'queued', m: 'attention', c1: 'attention', b2: 'queued' });
    expect(out.find((e) => e.id === 'a1')!.error).toMatchObject({ status: 400, code: 'X', title: 'Sai' });
    expect(out.find((e) => e.id === 'c1')!.error?.blockedBy).toBe('a1');
    // Bỏ các mục cần xử lý của đơn A: mục chạm A bị bỏ; c1 (đơn C) còn chờ người dùng bỏ ở đơn C.
    expect(discardAttention(out, 'A').map((e) => e.id)).toEqual(['b1', 'c1', 'b2']);
  });

  it('409 xung đột phiên bản: bỏ mục', () => {
    const q = build(input('a1', ['A']));
    expect(settleEntries(q, 'a1', classify(problem409('OpenOrder.VersionConflict')), 0)).toEqual([]);
  });

  it('đọc bản lưu: bỏ mục hỏng, mục đang chờ lùi giờ được gửi lại ngay', () => {
    const good = { ...build(input('a1', ['A']))[0]!, nextAttemptAt: 99999 };
    const raw = JSON.stringify([good, { id: 'x' }, { ...good, id: 'y', body: { clientRequestId: 'khác' } }]);
    expect(parseStoredQueue(raw)).toEqual([{ ...good, nextAttemptAt: 0 }]);
    expect(parseStoredQueue('không phải json')).toEqual([]);
  });
});

describe('hàng đợi — phần chạy', () => {
  function setup(responses: QueueHttpResult[]) {
    const store = new Map<string, string>();
    const sent: { id: string; body: unknown }[] = [];
    const timers: (() => void)[] = [];
    let now = 0;
    const order: string[] = [];
    const queue = createWriteQueue({
      transport: async (entry) => {
        // Ghi xuống máy trước khi gửi.
        order.push(store.has(queueKey('s1')) && store.get(queueKey('s1'))!.includes(entry.id) ? 'saved' : 'not-saved');
        sent.push({ id: entry.id, body: JSON.parse(JSON.stringify(entry.body)) });
        return responses.shift() ?? { status: 200, data: {} };
      },
      storage: {
        get: async (k) => store.get(k) ?? null,
        set: async (k, v) => {
          store.set(k, v);
        },
      },
      now: () => now,
      setTimer: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimer: () => {},
    });
    const flush = () => new Promise((r) => setTimeout(r, 0));
    return { queue, store, sent, order, timers, flush, advance: (ms: number) => (now += ms) };
  }

  it('ghi xuống máy rồi mới gửi; lỗi mạng → gửi lại ĐÚNG gói cũ; 2xx → bỏ khỏi hàng', async () => {
    const t = setup([{ status: null, data: null }, { status: 200, data: { order: { id: 'A' } } }]);
    const done = jest.fn();
    t.queue.setHandlers({ onDone: done });
    await t.queue.hydrate('s1');
    await t.queue.enqueue(input('a1', ['A']));
    await t.flush();
    expect(t.order[0]).toBe('saved');
    expect(t.sent).toHaveLength(1);
    expect(t.queue.store.getState().entries[0]).toMatchObject({ attempts: 1 });

    t.advance(1000);
    t.timers.shift()!();
    await t.flush();
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1]).toEqual(t.sent[0]);
    expect(t.queue.store.getState().entries).toEqual([]);
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }), { order: { id: 'A' } });
    expect(JSON.parse(t.store.get(queueKey('s1'))!)).toEqual([]);
  });

  it('cùng đơn: mục sau chờ mục trước có kết quả', async () => {
    const t = setup([]);
    await t.queue.hydrate('s1');
    await Promise.all([t.queue.enqueue(input('a1', ['A'])), t.queue.enqueue(input('a2', ['A']))]);
    await t.flush();
    await t.flush();
    expect(t.sent.map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  it('409 xung đột → báo tải lại đơn; 4xx khác → cần xử lý (409 khác cũng tải lại)', async () => {
    const order = { id: 'A', version: 7 };
    const t = setup([problem409('OpenOrder.VersionConflict', { order }), problem409('OpenOrder.LineNotSent', { order })]);
    const onConflict = jest.fn();
    const onAttention = jest.fn();
    t.queue.setHandlers({ onConflict, onAttention });
    await t.queue.hydrate('s1');
    await t.queue.enqueue(input('a1', ['A'], 'void'));
    await t.flush();
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onConflict.mock.calls[0][1].order).toEqual(order);
    expect(t.queue.store.getState().entries).toEqual([]);

    await t.queue.enqueue(input('a2', ['A'], 'void'));
    await t.flush();
    expect(onAttention).toHaveBeenCalledTimes(1);
    expect(onConflict).toHaveBeenCalledTimes(2);
    expect(t.queue.store.getState().entries[0]).toMatchObject({ id: 'a2', state: 'attention' });
  });

  it('mở lại app: nạp hàng đợi đã lưu và gửi tiếp', async () => {
    const t = setup([]);
    t.store.set(queueKey('s1'), JSON.stringify(build(input('a1', ['A']))));
    await t.queue.hydrate('s1');
    await t.flush();
    expect(t.sent.map((s) => s.id)).toEqual(['a1']);
  });

  it('đổi cửa hàng: ngừng gửi, bản lưu giữ nguyên', async () => {
    const t = setup([{ status: null, data: null }]);
    await t.queue.hydrate('s1');
    await t.queue.enqueue(input('a1', ['A']));
    await t.flush();
    t.queue.unload();
    expect(t.queue.store.getState().entries).toEqual([]);
    expect(JSON.parse(t.store.get(queueKey('s1'))!)).toHaveLength(1);
  });
});
