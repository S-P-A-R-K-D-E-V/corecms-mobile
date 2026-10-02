import {
  confirmOptimistic,
  expireStalePending,
  mergeServerMessages,
  reduceAssistantEvent,
  type ScreenMessage,
} from '../assistant-events';

const S = 'sess-1';
const NOW = Date.parse('2026-10-02T03:05:00Z');

function pending(id = 'a1'): ScreenMessage {
  return { id, role: 'assistant', content: '', createdAt: '2026-10-02T03:05:00Z', status: 'pending', streaming: true, pendingSince: NOW };
}

describe('reduceAssistantEvent', () => {
  it('chunk nối thêm chữ vào tin đang stream và bỏ nhãn tạm', () => {
    let msgs: ScreenMessage[] = [{ ...pending(), statusLabel: 'Đang suy nghĩ…' }];
    msgs = reduceAssistantEvent(msgs, { type: 'chunk', sessionId: S, messageId: 'a1', content: 'Doanh thu ' }, NOW);
    msgs = reduceAssistantEvent(msgs, { type: 'chunk', sessionId: S, messageId: 'a1', content: '**4.850.000đ**' }, NOW);
    expect(msgs[0]!.content).toBe('Doanh thu **4.850.000đ**');
    expect(msgs[0]!.statusLabel).toBeUndefined();
    expect(msgs[0]!.streaming).toBe(true);
  });

  it('chunk của tin chưa thấy (lỡ streamingStarted) → tạo tin mới', () => {
    const msgs = reduceAssistantEvent([], { type: 'chunk', sessionId: S, messageId: 'a9', content: 'Xin chào' }, NOW);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ id: 'a9', role: 'assistant', content: 'Xin chào', streaming: true });
  });

  it('step cập nhật theo id; completed chuyển bước đang chạy thành xong', () => {
    let msgs = [pending()];
    msgs = reduceAssistantEvent(msgs, { type: 'step', sessionId: S, messageId: 'a1', step: { id: 's1', kind: 'tool', name: 'analytics_revenue_read', label: 'Tra doanh thu', state: 'running' } }, NOW);
    msgs = reduceAssistantEvent(msgs, { type: 'step', sessionId: S, messageId: 'a1', step: { id: 's2', kind: 'tool', label: 'Tra tồn kho', state: 'running' } }, NOW);
    msgs = reduceAssistantEvent(msgs, { type: 'step', sessionId: S, messageId: 'a1', step: { id: 's1', state: 'done' } }, NOW);
    expect(msgs[0]!.steps).toEqual([
      { id: 's1', kind: 'tool', name: 'analytics_revenue_read', label: 'Tra doanh thu', state: 'done' },
      { id: 's2', kind: 'tool', label: 'Tra tồn kho', state: 'running' },
    ]);

    msgs = reduceAssistantEvent(msgs, { type: 'completed', sessionId: S, messageId: 'a1', content: 'Xong' }, NOW);
    expect(msgs[0]!.steps!.map((s) => s.state)).toEqual(['done', 'done']);
    expect(msgs[0]).toMatchObject({ status: 'complete', streaming: false, content: 'Xong' });
  });

  it('server cũ (không có step): status công cụ hiện nhãn tạm; phase end thì bỏ', () => {
    let msgs = [pending()];
    msgs = reduceAssistantEvent(msgs, { type: 'status', sessionId: S, messageId: 'a1', kind: 'tool', phase: 'start', name: 'payroll_read', label: 'Tra lương' }, NOW);
    expect(msgs[0]!.statusLabel).toBe('Tra lương');
    msgs = reduceAssistantEvent(msgs, { type: 'status', sessionId: S, messageId: 'a1', kind: 'tool', phase: 'end', name: 'payroll_read' }, NOW);
    expect(msgs[0]!.statusLabel).toBeUndefined();
  });

  it('đã có step thì bỏ qua status công cụ, nhưng vẫn nhận status suy nghĩ', () => {
    let msgs = reduceAssistantEvent([pending()], { type: 'step', sessionId: S, messageId: 'a1', step: { id: 's1', label: 'Tra lương', state: 'running' } }, NOW);
    const before = msgs;
    msgs = reduceAssistantEvent(msgs, { type: 'status', sessionId: S, messageId: 'a1', kind: 'tool', phase: 'start', label: 'Tra lương' }, NOW);
    expect(msgs).toBe(before);
    msgs = reduceAssistantEvent(msgs, { type: 'status', sessionId: S, messageId: 'a1', kind: 'thinking', label: 'Đang suy nghĩ…' }, NOW);
    expect(msgs[0]!.statusLabel).toBe('Đang suy nghĩ…');
  });

  it('error giữ phần đã trả lời, đặt status error + mã lỗi, thôi quay', () => {
    let msgs = reduceAssistantEvent([pending()], { type: 'chunk', sessionId: S, messageId: 'a1', content: 'Lịch tuần này: thứ 2 ca sáng' }, NOW);
    msgs = reduceAssistantEvent(msgs, { type: 'step', sessionId: S, messageId: 'a1', step: { id: 's1', state: 'running' } }, NOW);
    msgs = reduceAssistantEvent(msgs, { type: 'error', sessionId: S, messageId: 'a1', error: '[Lỗi chatbot: timeout]', code: 'timeout', retryable: true }, NOW);
    expect(msgs[0]).toMatchObject({ content: 'Lịch tuần này: thứ 2 ca sáng', status: 'error', errorCode: 'timeout', streaming: false });
    expect(msgs[0]!.steps![0]!.state).toBe('error');
  });

  it('error có partial của server → dùng partial; server cũ không mã → internal', () => {
    let msgs = reduceAssistantEvent([pending()], { type: 'chunk', sessionId: S, messageId: 'a1', content: 'abc' }, NOW);
    msgs = reduceAssistantEvent(msgs, { type: 'error', sessionId: S, messageId: 'a1', error: 'x', partial: 'abc def' }, NOW);
    expect(msgs[0]).toMatchObject({ content: 'abc def', errorCode: 'internal' });
  });

  it('completed mang blocks/steps/v của server', () => {
    const blocks = [{ type: 'suggestions', items: [{ label: 'So với tuần trước?' }] }];
    const msgs = reduceAssistantEvent(
      [pending()],
      { type: 'completed', sessionId: S, messageId: 'a1', content: 'Doanh thu', v: 1, status: 'complete', blocks, steps: [{ id: 's1', label: 'Tra doanh thu', state: 'running' }] },
      NOW
    );
    expect(msgs[0]).toMatchObject({ content: 'Doanh thu', v: 1, status: 'complete', blocks, streaming: false });
    expect(msgs[0]!.steps).toEqual([{ id: 's1', label: 'Tra doanh thu', state: 'done' }]);
  });

  it('streamingStarted của lượt Thử lại xoá lỗi + phần trả lời cũ', () => {
    const failed: ScreenMessage = { ...pending(), content: 'nửa câu', status: 'error', errorCode: 'gateway_error', streaming: false };
    const msgs = reduceAssistantEvent([failed], { type: 'streamingStarted', sessionId: S, messageId: 'a1' }, NOW);
    expect(msgs[0]).toMatchObject({ content: '', status: 'pending', errorCode: null, streaming: true });
  });
});

describe('mergeServerMessages', () => {
  it('giữ tin người dùng đang gửi (local-…) ở cuối tới khi server có id thật', () => {
    const local: ScreenMessage[] = [
      { id: 'u1', role: 'user', content: 'Chào', createdAt: '2026-10-02T03:00:00Z' },
      { id: 'local-1', role: 'user', content: 'Mẫu này còn hàng không?', createdAt: '2026-10-02T02:00:00Z', localUris: ['file:///a.jpg'] },
    ];
    const merged = mergeServerMessages(local, [
      { id: 'u1', role: 'user', content: 'Chào', createdAt: '2026-10-02T03:00:00Z' },
      { id: 'a1', role: 'assistant', content: 'Chào bạn', createdAt: '2026-10-02T03:00:02Z', status: 'complete' },
    ]);
    expect(merged.map((m) => m.id)).toEqual(['u1', 'a1', 'local-1']);
    expect(merged[2]!.localUris).toEqual(['file:///a.jpg']);
  });

  it('tin đã xác nhận giữ ảnh trên máy khi server trả về', () => {
    let local: ScreenMessage[] = [{ id: 'local-1', role: 'user', content: '', createdAt: '2026-10-02T03:00:00Z', localUris: ['file:///a.jpg'] }];
    local = confirmOptimistic(local, 'local-1', 'u1');
    const merged = mergeServerMessages(local, [
      { id: 'u1', role: 'user', content: '', createdAt: '2026-10-02T03:00:01Z', attachments: [{ kind: 'image', url: 'assistant/u/s/1.jpg?sig=x' }] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'u1', localUris: ['file:///a.jpg'] });
    expect(merged[0]!.attachments).toHaveLength(1);
  });

  it('server đã xong thắng bản đang quay; server còn chờ thì giữ bản đang stream', () => {
    const local: ScreenMessage[] = [{ ...pending('a1'), content: 'đang' }, { ...pending('a2'), content: 'dở' }];
    const merged = mergeServerMessages(local, [
      { id: 'a1', role: 'assistant', content: 'Đầy đủ', createdAt: '2026-10-02T03:05:00Z', status: 'complete', blocks: [] },
      { id: 'a2', role: 'assistant', content: '', createdAt: '2026-10-02T03:05:01Z', status: 'pending' },
    ]);
    expect(merged[0]).toMatchObject({ id: 'a1', content: 'Đầy đủ', streaming: false, status: 'complete' });
    expect(merged[1]).toMatchObject({ id: 'a2', content: 'dở', streaming: true });
  });

  it('tin cũ (không có status) có nội dung = complete', () => {
    const merged = mergeServerMessages([], [{ id: 'a1', role: 'assistant', content: 'Câu trả lời cũ', createdAt: '2026-09-06T01:00:00Z' }]);
    expect(merged[0]).toMatchObject({ status: 'complete', streaming: false });
  });

  it('tin chỉ có trên máy (ngoài limit) vẫn giữ', () => {
    const local: ScreenMessage[] = [{ id: 'old', role: 'user', content: 'cũ', createdAt: '2026-10-01T01:00:00Z' }];
    const merged = mergeServerMessages(local, [{ id: 'u2', role: 'user', content: 'mới', createdAt: '2026-10-02T01:00:00Z' }]);
    expect(merged.map((m) => m.id)).toEqual(['old', 'u2']);
  });
});

describe('expireStalePending', () => {
  it('quá hạn → lỗi timeout; chưa quá hạn giữ nguyên mảng', () => {
    const msgs = [pending()];
    expect(expireStalePending(msgs, NOW + 60_000, 6 * 60_000)).toBe(msgs);
    const expired = expireStalePending(msgs, NOW + 7 * 60_000, 6 * 60_000);
    expect(expired[0]).toMatchObject({ status: 'error', errorCode: 'timeout', streaming: false });
  });
});
