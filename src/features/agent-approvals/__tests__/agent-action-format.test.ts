import {
  MAX_PARAMS,
  REVISION_QUICK_NOTES,
  actionParams,
  actionTitle,
  agentActionRoute,
  appendQuickNote,
  canRequestRevision,
  canSubmitRevision,
  captionExcerpt,
  channelHandle,
  decodeUnicodeEscapes,
  platformLabel,
  revisionsLeftText,
  socialPostOf,
  splitRevisionNote,
  versionLabel,
  isActionable,
  isExpiringSoon,
  isResultSuccess,
  methodLabel,
  resultMessage,
  statusInfo,
  timeLeftText,
} from '../agent-action-format';
import { revisionBody, type AgentActionPreview } from 'src/api/agent-actions';

// Màn Duyệt việc agent: tham số đọc được từ bodyJson, thời gian còn lại, kết quả chạy sau khi duyệt.

const NOW = Date.parse('2026-11-18T03:00:00Z');
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

describe('actionParams', () => {
  it('không có body → []', () => {
    expect(actionParams(null)).toEqual([]);
    expect(actionParams('  ')).toEqual([]);
  });

  it('không phải JSON → null (màn hiện nguyên văn)', () => {
    expect(actionParams('abc')).toBeNull();
  });

  it('đối tượng lồng nhau, danh sách, giá trị đặc biệt', () => {
    const body = JSON.stringify({
      name: 'Áo thun',
      price: 150000,
      active: true,
      note: null,
      tags: ['hè', 'sale'],
      lines: [{ productId: 'p1', qty: 2 }],
      meta: { source: 'agent' },
      empty: '',
    });
    expect(actionParams(body)).toEqual([
      { key: 'name', value: 'Áo thun' },
      { key: 'price', value: '150000' },
      { key: 'active', value: 'Có' },
      { key: 'note', value: '—' },
      { key: 'tags', value: 'hè, sale' },
      { key: 'lines[1].productId', value: 'p1' },
      { key: 'lines[1].qty', value: '2' },
      { key: 'meta.source', value: 'agent' },
      { key: 'empty', value: '(trống)' },
    ]);
  });

  it('giá trị đơn / danh sách rỗng ở gốc', () => {
    expect(actionParams('5')).toEqual([{ key: 'Giá trị', value: '5' }]);
    expect(actionParams('[]')).toEqual([{ key: '(danh sách)', value: '(trống)' }]);
    expect(actionParams('{}')).toEqual([{ key: '(đối tượng)', value: '(trống)' }]);
  });

  it('quá nhiều tham số → gộp phần còn lại', () => {
    const obj = Object.fromEntries(Array.from({ length: MAX_PARAMS + 10 }, (_, i) => [`k${i}`, i]));
    const params = actionParams(JSON.stringify(obj))!;
    expect(params).toHaveLength(MAX_PARAMS);
    expect(params[MAX_PARAMS - 1]).toEqual({ key: '…', value: 'và 11 tham số nữa' });
  });
});

describe('thời gian còn lại', () => {
  it('timeLeftText', () => {
    expect(timeLeftText(at(-1), NOW)).toBe('Đã hết hạn');
    expect(timeLeftText(at(0.5), NOW)).toBe('Còn dưới 1 phút');
    expect(timeLeftText(at(40), NOW)).toBe('Còn 40 phút');
    expect(timeLeftText(at(120), NOW)).toBe('Còn 2 giờ');
    expect(timeLeftText(at(125), NOW)).toBe('Còn 2 giờ 5 phút');
    expect(timeLeftText(at(60 * 24 + 60 * 3), NOW)).toBe('Còn 1 ngày 3 giờ');
    expect(timeLeftText('not-a-date', NOW)).toBe('');
  });

  it('isExpiringSoon / isActionable', () => {
    expect(isExpiringSoon(at(10), NOW)).toBe(true);
    expect(isExpiringSoon(at(30), NOW)).toBe(false);
    expect(isExpiringSoon(at(-5), NOW)).toBe(false);
    expect(isActionable({ status: 'pending', expiresAt: at(5) }, NOW)).toBe(true);
    expect(isActionable({ status: 'pending', expiresAt: at(-5) }, NOW)).toBe(false);
    expect(isActionable({ status: 'rejected', expiresAt: at(5) }, NOW)).toBe(false);
  });
});

describe('kết quả chạy', () => {
  it('isResultSuccess: đã chạy + 2xx', () => {
    expect(isResultSuccess({ status: 'executed', resultStatusCode: 200 })).toBe(true);
    expect(isResultSuccess({ status: 'executed', resultStatusCode: null })).toBe(true);
    expect(isResultSuccess({ status: 'executed', resultStatusCode: 400 })).toBe(false);
    expect(isResultSuccess({ status: 'failed', resultStatusCode: 500 })).toBe(false);
    expect(isResultSuccess({ status: 'pending', resultStatusCode: null })).toBe(false);
  });

  it('resultMessage: lấy câu lỗi của ProblemDetails / validation, không thì nguyên văn', () => {
    expect(resultMessage(JSON.stringify({ title: 'Lỗi', detail: 'Hết hàng' }))).toBe('Hết hàng');
    expect(resultMessage(JSON.stringify({ errors: { Price: ['Giá phải > 0'] } }))).toBe('Giá phải > 0');
    expect(resultMessage('Internal error')).toBe('Internal error');
    expect(resultMessage(null)).toBe('');
    expect(resultMessage('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('nhãn', () => {
  it('trạng thái lạ giữ nguyên chữ', () => {
    expect(statusInfo('pending')).toEqual({ label: 'Chờ duyệt', tone: 'warning' });
    expect(statusInfo('weird').label).toBe('weird');
    expect(statusInfo('revision_requested').label).toBe('Đã yêu cầu sửa');
  });

  it('methodLabel + route', () => {
    expect(methodLabel('post')).toBe('Tạo / gửi');
    expect(methodLabel('PATCH')).toBe('Sửa');
    expect(methodLabel('DELETE')).toBe('Xoá');
    expect(agentActionRoute('abc')).toBe('/agent/approvals/abc');
  });
});

const SOCIAL: AgentActionPreview = {
  kind: 'social_post',
  title: 'Tạo bài đăng mạng xã hội',
  socialPost: {
    mode: 'schedule',
    modeLabel: 'Hẹn đăng 19:30 hôm nay (18/11)',
    scheduledAt: '2026-11-18T12:30:00Z',
    text: 'Dòng 1 🤔\n\nDòng 2',
    imageUrls: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
    channels: [{ id: 'c1', platform: 'threads', name: 'CiCi', username: 'cici.store', avatarUrl: null }],
    products: [],
  },
  fields: [],
};

describe('bản xem trước', () => {
  const base = { method: 'POST', pathAndQuery: '/api/internal/social/posts', summary: '' };

  it('actionTitle: title → preview.title → summary (giải mã emoji) → method + path', () => {
    expect(actionTitle({ ...base, title: 'Tạo bài đăng', preview: SOCIAL })).toBe('Tạo bài đăng');
    expect(actionTitle({ ...base, title: '  ', preview: SOCIAL })).toBe('Tạo bài đăng mạng xã hội');
    expect(actionTitle({ ...base, summary: 'Quyền social.write — "\\uD83E\\uDD14 hi"' })).toBe('Quyền social.write — "🤔 hi"');
    expect(actionTitle(base)).toBe('Tạo / gửi /api/internal/social/posts');
  });

  it('decodeUnicodeEscapes ghép cặp surrogate thành emoji, giữ chữ thường', () => {
    expect(decodeUnicodeEscapes('a \\uD83E\\uDD14 b \\u00e1')).toBe('a 🤔 b á');
    expect(decodeUnicodeEscapes('không đổi')).toBe('không đổi');
  });

  it('socialPostOf chỉ nhận kind social_post có socialPost', () => {
    expect(socialPostOf({ preview: SOCIAL })?.modeLabel).toBe('Hẹn đăng 19:30 hôm nay (18/11)');
    expect(socialPostOf({ preview: { ...SOCIAL, kind: 'generic' } })).toBeNull();
    expect(socialPostOf({ preview: { ...SOCIAL, socialPost: null } })).toBeNull();
    expect(socialPostOf({ preview: null })).toBeNull();
    expect(socialPostOf(undefined)).toBeNull();
  });

  it('captionExcerpt gộp dòng, cắt không vỡ emoji', () => {
    expect(captionExcerpt('Dòng 1 🤔\n\nDòng 2')).toBe('Dòng 1 🤔 Dòng 2');
    expect(captionExcerpt(null)).toBe('');
    expect(captionExcerpt('🤔🤔🤔🤔🤔', 3)).toBe('🤔🤔…');
    expect(captionExcerpt('abc', 3)).toBe('abc');
  });

  it('versionLabel chỉ hiện từ bản 2', () => {
    expect(versionLabel(2)).toBe('Bản 2');
    expect(versionLabel(1)).toBeNull();
    expect(versionLabel(null)).toBeNull();
    expect(versionLabel(undefined)).toBeNull();
  });

  it('platformLabel / channelHandle', () => {
    expect(platformLabel('threads')).toBe('Threads');
    expect(platformLabel('TikTok')).toBe('TikTok');
    expect(platformLabel('lemon8')).toBe('Lemon8');
    expect(platformLabel(null)).toBe('');
    expect(channelHandle({ username: '@cici.store', platform: 'threads' })).toBe('@cici.store · Threads');
    expect(channelHandle({ username: null, platform: 'facebook' })).toBe('Facebook');
  });
});

describe('yêu cầu sửa', () => {
  it('appendQuickNote nối mỗi ý một dòng, không lặp', () => {
    expect(appendQuickNote('', REVISION_QUICK_NOTES[0])).toBe('Ảnh đẹp / sáng hơn');
    expect(appendQuickNote('Ảnh 2 tối  ', 'Viết ngắn lại')).toBe('Ảnh 2 tối\nViết ngắn lại');
    expect(appendQuickNote('Viết ngắn lại', 'Viết ngắn lại')).toBe('Viết ngắn lại');
  });

  it('canRequestRevision / revisionsLeftText', () => {
    expect(canRequestRevision({ revisionsLeft: 2 })).toBe(true);
    expect(canRequestRevision({ revisionsLeft: null })).toBe(true);
    expect(canRequestRevision({})).toBe(true);
    expect(canRequestRevision({ revisionsLeft: 0 })).toBe(false);
    expect(revisionsLeftText(2)).toBe('Còn 2 lần yêu cầu sửa');
    expect(revisionsLeftText(0)).toBe('Đã hết lượt yêu cầu sửa');
    expect(revisionsLeftText(null)).toBe('');
  });

  it('canSubmitRevision cần ghi chú hoặc ảnh', () => {
    expect(canSubmitRevision('  ', [])).toBe(false);
    expect(canSubmitRevision('Sửa giờ', [])).toBe(true);
    expect(canSubmitRevision('', ['https://cdn/a.jpg'])).toBe(true);
  });

  it('splitRevisionNote tách ghi chú và ảnh cần làm lại', () => {
    expect(splitRevisionNote('Ảnh tối quá\nẢnh cần làm lại:\n- https://cdn/a.jpg\n- https://cdn/b.jpg')).toEqual({
      text: 'Ảnh tối quá',
      imageUrls: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
    });
    expect(splitRevisionNote('Ảnh cần làm lại:\n- https://cdn/a.jpg')).toEqual({ text: '', imageUrls: ['https://cdn/a.jpg'] });
    expect(splitRevisionNote('Viết ngắn lại')).toEqual({ text: 'Viết ngắn lại', imageUrls: [] });
    expect(splitRevisionNote(null)).toEqual({ text: '', imageUrls: [] });
  });

  it('revisionBody bỏ phần trống, bỏ ảnh trùng', () => {
    expect(revisionBody({ note: '  ', imageUrls: [] })).toEqual({});
    expect(revisionBody({ note: ' Sửa ', imageUrls: ['https://a', ' https://a ', ''] })).toEqual({
      note: 'Sửa',
      imageUrls: ['https://a'],
    });
  });
});
