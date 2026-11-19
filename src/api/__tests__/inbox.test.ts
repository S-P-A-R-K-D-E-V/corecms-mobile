// Hộp thư khách: chuẩn hoá dữ liệu máy chủ (thiếu trường F5 vẫn chạy), tham số danh sách, API F5 chưa có → notSupported.

jest.mock('../axios', () => {
  const actual = jest.requireActual('../axios');
  return { __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, endpoints: actual.endpoints };
});
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));

import axios from '../axios';
import {
  f5Data,
  getInboxSummary,
  hideComment,
  listParams,
  markConversationUnread,
  normalizeConversation,
  normalizeDetail,
  normalizeMessage,
} from '../inbox';

const get = axios.get as jest.Mock;
const post = axios.post as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('chuẩn hoá', () => {
  it('hội thoại thiếu trường → mặc định an toàn', () => {
    const c = normalizeConversation({ id: 'c1', holder: { type: 'weird' }, customer: {} });
    expect(c.kind).toBe('dm');
    expect(c.holder.type).toBe('none');
    expect(c.customer.name).toBe('Khách');
    expect(c.tags).toEqual([]);
    expect(c.postId).toBeNull();
    expect(c.lastMessage).toBeNull();
  });

  it('chi tiết: canReply mặc định true, reason giữ nguyên', () => {
    expect(normalizeDetail({ id: 'c1' }).canReply).toBe(true);
    const d = normalizeDetail({ id: 'c1', canReply: false, reason: 'Quá 24 giờ', customerPanel: { id: 'k', totalSpent: '120000' } });
    expect(d.canReply).toBe(false);
    expect(d.reason).toBe('Quá 24 giờ');
    expect(d.customerPanel?.totalSpent).toBe(120000);
    expect(d.customerPanel?.recentInvoices).toEqual([]);
  });

  it('tin: bỏ tệp không có url, trạng thái lạ giữ nguyên', () => {
    const m = normalizeMessage({ id: 'm', direction: 'out', attachments: [{ type: 'image', url: 'https://x/a.jpg' }, { type: 'image' }], status: 'suggested' });
    expect(m.attachments).toHaveLength(1);
    expect(m.status).toBe('suggested');
    expect(m.senderType).toBe('user');
  });

  it('tóm tắt: máy chủ cũ không có số theo loại → null', async () => {
    get.mockResolvedValueOnce({ data: { unassigned: 2, unread: 3 } });
    const s = await getInboxSummary();
    expect(s).toMatchObject({ unassigned: 2, unread: 3, mine: 0, unreadMessages: null, unreadComments: null });
  });
});

it('tham số danh sách: chỉ gửi bộ lọc đang bật', () => {
  expect(listParams({ box: 'all', kind: null, q: ' ', tag: null, unread: false, status: 'open' })).toEqual({ status: 'open', take: 30 });
  expect(listParams({ box: 'mine', kind: 'comment', q: 'lan', tag: 'Ưu tiên', unread: true, status: 'open' }, '2026-11-19T00:00:00Z')).toEqual({
    status: 'open',
    take: 30,
    box: 'mine',
    q: 'lan',
    tag: 'Ưu tiên',
    kind: 'comment',
    unread: 'true',
    before: '2026-11-19T00:00:00Z',
  });
});

describe('API F5 chưa có trên máy chủ', () => {
  it('404 không body → notSupported; 404 có ProblemDetails → ném body kèm status', () => {
    expect(f5Data({ status: 200, data: { ok: 1 } })).toEqual({ ok: 1 });
    expect(() => f5Data({ status: 404, data: '' })).toThrow();
    try {
      f5Data({ status: 405, data: '' });
    } catch (e) {
      expect(e).toMatchObject({ status: 405, notSupported: true });
    }
    try {
      f5Data({ status: 404, data: { errorCodes: ['Conversation.NotFound'] } });
    } catch (e) {
      expect(e).toMatchObject({ status: 404, errorCodes: ['Conversation.NotFound'] });
      expect((e as { notSupported?: boolean }).notSupported).toBeUndefined();
    }
  });

  it('ẩn bình luận / đánh dấu chưa đọc gọi đúng đường dẫn', async () => {
    post.mockResolvedValueOnce({ status: 200, data: { id: 'm1', status: 'hidden' } });
    await expect(hideComment('c1', 'm1', true)).resolves.toMatchObject({ id: 'm1', status: 'hidden' });
    expect(post.mock.calls[0][0]).toBe('/conversations/c1/messages/m1/hide');
    expect(post.mock.calls[0][1]).toEqual({ hidden: true });
    post.mockResolvedValueOnce({ status: 404, data: '' });
    await expect(markConversationUnread('c1')).rejects.toMatchObject({ notSupported: true });
    expect(post.mock.calls[1][0]).toBe('/conversations/c1/unread');
  });
});
