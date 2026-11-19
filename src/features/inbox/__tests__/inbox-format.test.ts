import type { ConversationListFilter, ConversationMessage, ConversationPage, ConversationSummary, InboxSummary } from 'src/api/inbox';

import {
  DEFAULT_FILTER,
  addMessageToPages,
  applyQuickReplyText,
  bubbleKind,
  canToggleCommentHidden,
  facebookPostUrl,
  filterQuickReplies,
  flattenMessages,
  holderActions,
  holderLabel,
  inboxAttentionCount,
  inboxErrorKind,
  kindUnreadCount,
  lastMessagePreview,
  matchesFilter,
  maxImagesFor,
  outgoingSenderCaption,
  relativeTime,
  togglePriorityTag,
  upsertConversationPages,
  windowWarning,
} from '../inbox-format';

// Hộp thư khách: nhãn người giữ, nút được phép, "Bạn: …", giờ tương đối, gộp sự kiện trực tiếp, phân loại lỗi máy chủ.

const ME = 'me-1';

function conv(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: 'c1',
    channelId: 'ch1',
    channelName: 'CiCi',
    platform: 'facebook',
    kind: 'dm',
    postId: null,
    customer: { id: null, name: 'Lan', avatarUrl: null, phone: null, code: null },
    lastMessage: { text: 'Còn hàng không?', direction: 'in', senderType: 'customer', at: '2026-11-19T03:00:00Z' },
    unreadCount: 0,
    status: 'open',
    holder: { type: 'none', userId: null, name: null, since: null },
    holderVersion: 1,
    assignedUserId: null,
    assignedName: null,
    tags: [],
    lastCustomerMessageAt: null,
    windowEndsAt: null,
    lastMessageAt: '2026-11-19T03:00:00Z',
    ...over,
  };
}

function msg(over: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    direction: 'in',
    senderType: 'customer',
    senderName: 'Lan',
    text: 'Chào shop',
    attachments: [],
    status: 'received',
    error: null,
    isInternalNote: false,
    sentAt: '2026-11-19T03:00:00Z',
    ...over,
  };
}

describe('người giữ hội thoại', () => {
  it('nhãn theo loại người giữ', () => {
    expect(holderLabel({ type: 'none', userId: null, name: null, since: null }, ME)).toBe('Chưa ai nhận');
    expect(holderLabel({ type: 'agent', userId: null, name: null, since: null }, ME)).toBe('Agent đang trả lời');
    expect(holderLabel({ type: 'external', userId: null, name: null, since: null }, ME)).toBe('Nhân viên trên Facebook');
    expect(holderLabel({ type: 'user', userId: 'u2', name: 'Trà My', since: null }, ME)).toBe('Đang do Trà My trả lời');
    expect(holderLabel({ type: 'user', userId: 'u2', name: '  ', since: null }, ME)).toBe('Đang do nhân viên khác trả lời');
    expect(holderLabel({ type: 'user', userId: ME, name: 'Tôi', since: null }, ME)).toBe('Bạn đang trả lời');
  });

  it('nút theo quyền: không có reply → không nút; người khác giữ → chỉ quản lý giành được', () => {
    const none = { type: 'none' as const, userId: null, name: null, since: null };
    const mine = { type: 'user' as const, userId: ME, name: null, since: null };
    const other = { type: 'user' as const, userId: 'u2', name: 'An', since: null };
    const agent = { type: 'agent' as const, userId: null, name: null, since: null };
    expect(holderActions(none, ME, { reply: false, manage: true })).toEqual([]);
    expect(holderActions(none, ME, { reply: true, manage: false })).toEqual(['take', 'to-agent']);
    expect(holderActions(mine, ME, { reply: true, manage: false })).toEqual(['release', 'to-agent']);
    expect(holderActions(other, ME, { reply: true, manage: false })).toEqual([]);
    expect(holderActions(other, ME, { reply: true, manage: true })).toEqual(['force-take']);
    expect(holderActions(agent, ME, { reply: true, manage: false })).toEqual(['take']);
  });
});

describe('danh sách', () => {
  it('tin cuối: "Bạn: " khi tin đi, [Ảnh / tệp] khi không có chữ', () => {
    expect(lastMessagePreview(conv())).toBe('Còn hàng không?');
    expect(lastMessagePreview(conv({ lastMessage: { text: 'Dạ còn ạ', direction: 'out', senderType: 'agent', at: '' } }))).toBe('Bạn: Dạ còn ạ');
    expect(lastMessagePreview(conv({ lastMessage: { text: ' ', direction: 'out', senderType: 'user', at: '' } }))).toBe('Bạn: [Ảnh / tệp]');
    expect(lastMessagePreview(conv({ lastMessage: null }))).toBe('Chưa có tin nhắn');
  });

  it('giờ tương đối', () => {
    const now = new Date('2026-11-19T10:00:00').getTime();
    expect(relativeTime(new Date(now - 20_000).toISOString(), now)).toBe('Vừa xong');
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 phút');
    expect(relativeTime(new Date('2026-11-19T07:05:00').toISOString(), now)).toBe('07:05');
    expect(relativeTime(new Date('2026-11-18T22:00:00').toISOString(), now)).toBe('Hôm qua');
    expect(relativeTime(new Date('2026-11-17T09:00:00').toISOString(), now)).toBe('T3');
    expect(relativeTime(new Date('2026-10-02T09:00:00').toISOString(), now)).toBe('02/10');
    expect(relativeTime(null, now)).toBe('');
  });

  it('nhãn Ưu tiên bật / tắt, giữ nhãn khác', () => {
    expect(togglePriorityTag(['VIP'])).toEqual(['Ưu tiên', 'VIP']);
    expect(togglePriorityTag(['VIP', 'ưu tiên'])).toEqual(['VIP']);
  });

  it('số chưa đọc theo tab — máy chủ cũ không có số theo loại thì tab Tất cả dùng unread', () => {
    const s: InboxSummary = { unassigned: 2, mine: 1, agent: 0, external: 0, unread: 5, open: 9, unreadMessages: 3, unreadComments: 1 };
    expect(kindUnreadCount(s, 'all')).toBe(4);
    expect(kindUnreadCount(s, 'dm')).toBe(3);
    expect(kindUnreadCount(s, 'comment')).toBe(1);
    const old = { ...s, unreadMessages: null, unreadComments: null };
    expect(kindUnreadCount(old, 'all')).toBe(5);
    expect(kindUnreadCount(old, 'comment')).toBe(0);
    expect(inboxAttentionCount(s)).toBe(7);
    expect(inboxAttentionCount(null)).toBe(0);
  });

  it('khớp bộ lọc: box / loại / nhãn; đang tìm chữ → không đoán (null)', () => {
    const f: ConversationListFilter = { ...DEFAULT_FILTER, box: 'unassigned' };
    expect(matchesFilter(conv(), f, ME)).toBe(true);
    expect(matchesFilter(conv({ holder: { type: 'agent', userId: null, name: null, since: null } }), f, ME)).toBe(false);
    expect(matchesFilter(conv(), { ...DEFAULT_FILTER, kind: 'comment' }, ME)).toBe(false);
    expect(matchesFilter(conv({ tags: ['Ưu tiên'] }), { ...DEFAULT_FILTER, tag: 'Ưu tiên' }, ME)).toBe(true);
    expect(matchesFilter(conv(), { ...DEFAULT_FILTER, q: 'lan' }, ME)).toBeNull();
    expect(matchesFilter(conv({ assignedUserId: ME }), { ...DEFAULT_FILTER, box: 'mine' }, ME)).toBe(true);
  });

  it('gộp sự kiện: thêm lên đầu, xếp theo tin mới, bỏ khi không còn khớp', () => {
    const pages: ConversationPage[] = [
      { items: [conv({ id: 'a', lastMessageAt: '2026-11-19T05:00:00Z' }), conv({ id: 'b', lastMessageAt: '2026-11-19T04:00:00Z' })], nextBefore: 'x' },
      { items: [conv({ id: 'c', lastMessageAt: '2026-11-19T01:00:00Z' })], nextBefore: null },
    ];
    const added = upsertConversationPages(pages, conv({ id: 'n', lastMessageAt: '2026-11-19T06:00:00Z' }), DEFAULT_FILTER, ME)!;
    expect(added[0]!.items.map((c) => c.id)).toEqual(['n', 'a', 'b']);
    expect(added[1]!.items.map((c) => c.id)).toEqual(['c']);
    const moved = upsertConversationPages(pages, conv({ id: 'c', lastMessageAt: '2026-11-19T07:00:00Z' }), DEFAULT_FILTER, ME)!;
    expect(moved.flatMap((p) => p.items.map((c) => c.id))).toEqual(['c', 'a', 'b']);
    const removed = upsertConversationPages(pages, conv({ id: 'a', status: 'closed' }), DEFAULT_FILTER, ME)!;
    expect(removed.flatMap((p) => p.items.map((c) => c.id))).toEqual(['b', 'c']);
  });
});

describe('tin nhắn', () => {
  it('kiểu hiển thị: gợi ý / ghi chú / tin đi / tin khách', () => {
    expect(bubbleKind(msg({ status: 'suggested', isInternalNote: true, direction: 'out', senderType: 'agent' }))).toBe('suggestion');
    expect(bubbleKind(msg({ isInternalNote: true, direction: 'out', senderType: 'user' }))).toBe('note');
    expect(bubbleKind(msg({ direction: 'out', senderType: 'external' }))).toBe('out');
    expect(bubbleKind(msg())).toBe('in');
  });

  it('dòng người gửi dưới tin đi', () => {
    expect(outgoingSenderCaption({ senderType: 'user', senderName: 'Trà My' })).toBe('Người gửi: Trà My');
    expect(outgoingSenderCaption({ senderType: 'agent', senderName: null })).toBe('Người gửi: Agent CSKH');
    expect(outgoingSenderCaption({ senderType: 'external', senderName: null })).toBe('Người gửi: Nhân viên (trên Facebook)');
  });

  it('ẩn / hiện chỉ cho bình luận của khách', () => {
    expect(canToggleCommentHidden(msg(), 'comment')).toBe(true);
    expect(canToggleCommentHidden(msg({ status: 'hidden' }), 'comment')).toBe(true);
    expect(canToggleCommentHidden(msg(), 'dm')).toBe(false);
    expect(canToggleCommentHidden(msg({ direction: 'out' }), 'comment')).toBe(false);
    expect(maxImagesFor('comment')).toBe(1);
    expect(maxImagesFor('dm')).toBe(10);
  });

  it('trang tin: gộp cũ → mới, thêm tin mới không trùng', () => {
    const pages = [
      { items: [msg({ id: 'm3', sentAt: '2026-11-19T03:00:00Z' })], nextBefore: 'p' },
      { items: [msg({ id: 'm1', sentAt: '2026-11-19T01:00:00Z' }), msg({ id: 'm2', sentAt: '2026-11-19T02:00:00Z' })], nextBefore: null },
    ];
    expect(flattenMessages(pages).map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    const added = addMessageToPages(pages, msg({ id: 'm4', sentAt: '2026-11-19T04:00:00Z' }))!;
    expect(flattenMessages(added).map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
    const same = addMessageToPages(added, msg({ id: 'm4', sentAt: '2026-11-19T04:00:00Z', status: 'failed' }))!;
    expect(flattenMessages(same).filter((m) => m.id === 'm4')).toHaveLength(1);
    expect(flattenMessages(same).find((m) => m.id === 'm4')!.status).toBe('failed');
  });

  it('cửa sổ 24 giờ: chỉ cảnh báo khi còn dưới 3 giờ hoặc đã hết', () => {
    const now = Date.parse('2026-11-19T10:00:00Z');
    expect(windowWarning(null, now)).toBeNull();
    expect(windowWarning('2026-11-19T20:00:00Z', now)).toBeNull();
    expect(windowWarning('2026-11-19T12:15:00Z', now)).toBe('Còn 2 giờ 15 phút để trả lời (cửa sổ 24 giờ của Meta).');
    expect(windowWarning('2026-11-19T09:00:00Z', now)).toMatch(/Đã quá 24 giờ/);
  });

  it('link bài Facebook của hội thoại bình luận', () => {
    expect(facebookPostUrl('123_456')).toBe('https://www.facebook.com/123_456');
    expect(facebookPostUrl(null)).toBeNull();
  });
});

describe('mẫu trả lời nhanh', () => {
  const replies = [
    { id: '1', shortcut: 'gia', title: 'Báo giá', text: 'Giá {sp} là…', imageUrls: [], sortOrder: 2 },
    { id: '2', shortcut: 'ship', title: 'Phí giao hàng', text: 'Ship nội thành 20k', imageUrls: [], sortOrder: 1 },
    { id: '3', shortcut: 'dia-chi', title: 'Địa chỉ', text: '21 Chùa Láng', imageUrls: [], sortOrder: 0 },
  ];
  it('tìm theo phím tắt (đứng trước) rồi tiêu đề / nội dung, bỏ dấu', () => {
    expect(filterQuickReplies(replies, '').map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(filterQuickReplies(replies, '/gia').map((r) => r.id)).toEqual(['1', '2']);
    expect(filterQuickReplies(replies, 'dia').map((r) => r.id)).toEqual(['3']);
    expect(filterQuickReplies(replies, 'giao').map((r) => r.id)).toEqual(['2']);
  });
  it('chèn mẫu vào ô gõ', () => {
    expect(applyQuickReplyText('', { text: 'Xin chào' })).toBe('Xin chào');
    expect(applyQuickReplyText('Dạ  ', { text: 'Xin chào' })).toBe('Dạ\nXin chào');
  });
});

describe('lỗi máy chủ', () => {
  it('theo mã lỗi ProblemDetails; API F5 chưa có → not-supported', () => {
    expect(inboxErrorKind({ status: 409, errorCodes: ['Conversation.HeldByOther'] })).toBe('held-by-other');
    expect(inboxErrorKind({ status: 409, errorCodes: ['Conversation.WindowClosed'] })).toBe('window-closed');
    expect(inboxErrorKind({ status: 400, errorCodes: ['Conversation.AgentOff'] })).toBe('agent-off');
    expect(inboxErrorKind({ status: 409, errorCodes: ['Customer.PhoneAmbiguous'] })).toBe('phone-ambiguous');
    expect(inboxErrorKind({ status: 404, notSupported: true })).toBe('not-supported');
    expect(inboxErrorKind('Something went wrong')).toBe('other');
  });
});
