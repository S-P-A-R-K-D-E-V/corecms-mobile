import { normalizeMessage, normalizeMessageCard, type MessageCard } from 'src/api/messenger';
import { t } from 'src/i18n';
import {
  SYSTEM_USER_ID,
  excludeSystemUsers,
  senderDisplayName,
  systemConversationIcon,
  systemConversationName,
} from 'src/features/chat/messenger-system';

import {
  cardActionLook,
  cardErrorInfo,
  cardState,
  cardStatusText,
  cardTargetRoute,
  dashedGuid,
  parseCardTime,
  visibleCardActions,
} from '../message-card-format';

const ACTION_ID = '3f2b1c4d-1111-4222-8333-444455556666';
const TASK_ID = 'a1b2c3d4-aaaa-4bbb-8ccc-ddddeeeeffff';
const NOW = Date.parse('2026-11-19T03:00:00Z');

function approvalCard(over: Partial<MessageCard> = {}): MessageCard {
  return {
    kind: 'approval',
    refId: ACTION_ID,
    title: 'Marketing Threads xin duyệt: Tạo bài đăng mạng xã hội',
    lines: ['Hẹn đăng 19:30 hôm nay'],
    link: `/dashboard/agent/approvals?id=${ACTION_ID}`,
    status: 'open',
    statusText: null,
    expiresAt: '2026-11-19T05:00:00Z',
    actions: [
      { key: 'approve', label: 'Duyệt', style: 'primary' },
      { key: 'revise', label: 'Yêu cầu sửa', style: 'default' },
      { key: 'reject', label: 'Từ chối', style: 'danger' },
      { key: 'open', label: 'Mở phiếu', style: 'default' },
    ],
    updatedAt: null,
    ...over,
  };
}

function questionCard(over: Partial<MessageCard> = {}): MessageCard {
  return {
    kind: 'task_question',
    refId: TASK_ID,
    title: 'Phân tích – Điều phối đang hỏi',
    lines: [],
    link: `/dashboard/agent/center?task=${TASK_ID}`,
    status: 'open',
    statusText: null,
    expiresAt: null,
    actions: [
      { key: 'reply', label: 'Trả lời', style: 'primary' },
      { key: 'open', label: 'Mở việc', style: 'default' },
    ],
    updatedAt: null,
    ...over,
  };
}

const keys = (card: MessageCard, canApprove: boolean, now = NOW) =>
  visibleCardActions(card, { canApprove, now }).map((a) => a.key);

describe('normalizeMessageCard — chịu được thẻ thiếu / hỏng', () => {
  it('null / không phải object / thiếu kind hoặc refId → null (hiện như tin chữ)', () => {
    expect(normalizeMessageCard(null)).toBeNull();
    expect(normalizeMessageCard(undefined)).toBeNull();
    expect(normalizeMessageCard('x')).toBeNull();
    expect(normalizeMessageCard([])).toBeNull();
    expect(normalizeMessageCard({ kind: 'approval' })).toBeNull();
    expect(normalizeMessageCard({ refId: ACTION_ID })).toBeNull();
  });

  it('thiếu lines / actions / status → mảng rỗng, "open"; bỏ dòng và nút hỏng; tối đa 6 dòng', () => {
    const card = normalizeMessageCard({
      kind: 'task_failed',
      refId: TASK_ID,
      lines: ['a', 1, '', 'b', 'c', 'd', 'e', 'f', 'g'],
      actions: [null, { label: 'Không có khoá' }, { key: 'open' }],
    })!;
    expect(card.title).toBe('');
    expect(card.status).toBe('open');
    expect(card.lines).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(card.actions).toEqual([{ key: 'open', label: 'open', style: null }]);
    expect(card.link).toBeNull();
    expect(card.expiresAt).toBeNull();
  });

  it('tin thường (không có card) → card null', () => {
    expect(normalizeMessage({ id: '1', content: 'chào' } as any).card).toBeNull();
    expect(normalizeMessage({ id: '1', card: approvalCard() } as any).card?.refId).toBe(ACTION_ID);
  });
});

describe('cardState / cardStatusText', () => {
  it('open chưa hết hạn → mở, không có dòng trạng thái', () => {
    expect(cardState(approvalCard(), NOW)).toBe('open');
    expect(cardStatusText(approvalCard(), NOW)).toBeNull();
  });

  it('done → statusText của máy chủ; thiếu → "Đã xử lý"', () => {
    const done = approvalCard({ status: 'done', statusText: 'Đã duyệt bởi Xuân Bình · 10:42' });
    expect(cardState(done, NOW)).toBe('done');
    expect(cardStatusText(done, NOW)).toBe('Đã duyệt bởi Xuân Bình · 10:42');
    expect(cardStatusText(approvalCard({ status: 'done', statusText: null }), NOW)).toBe(t('chat.card.done'));
  });

  it('open mà quá expiresAt → "Hết hạn"; done thì vẫn hiện statusText dù quá hạn', () => {
    const late = approvalCard({ expiresAt: '2026-11-19T02:59:00Z' });
    expect(cardState(late, NOW)).toBe('expired');
    expect(cardStatusText(late, NOW)).toBe(t('chat.card.expired'));
    expect(cardState(approvalCard({ expiresAt: '2026-11-19T02:59:00Z', status: 'done' }), NOW)).toBe('done');
  });

  it('expiresAt không có múi giờ coi là UTC; chuỗi hỏng bỏ qua', () => {
    expect(parseCardTime('2026-11-19T03:00:00')).toBe(NOW);
    expect(parseCardTime('2026-11-19T10:00:00+07:00')).toBe(NOW);
    expect(parseCardTime('không phải ngày')).toBeNull();
    expect(cardState(approvalCard({ expiresAt: 'hỏng' }), NOW)).toBe('open');
  });
});

describe('visibleCardActions — nút theo quyền và trạng thái', () => {
  it('có agent.approve → đủ nút máy chủ gửi, giữ thứ tự', () => {
    expect(keys(approvalCard(), true)).toEqual(['approve', 'revise', 'reject', 'open']);
    expect(keys(questionCard(), true)).toEqual(['reply', 'open']);
  });

  it('không có agent.approve → chỉ còn Mở', () => {
    expect(keys(approvalCard(), false)).toEqual(['open']);
    expect(keys(questionCard(), false)).toEqual(['open']);
  });

  it('thẻ done hoặc hết hạn → ẩn mọi nút', () => {
    expect(keys(approvalCard({ status: 'done', statusText: 'Đã từ chối' }), true)).toEqual([]);
    expect(keys(approvalCard({ expiresAt: '2026-11-19T02:00:00Z' }), true)).toEqual([]);
  });

  it('bỏ nút lạ và nút trùng khoá', () => {
    const card = approvalCard({
      actions: [
        { key: 'approve', label: 'Duyệt', style: 'primary' },
        { key: 'approve', label: 'Duyệt lần 2', style: 'primary' },
        { key: 'delete_everything', label: '??', style: 'danger' },
      ],
    });
    expect(visibleCardActions(card, { canApprove: true, now: NOW })).toEqual([{ key: 'approve', label: 'Duyệt', style: 'primary' }]);
  });

  it('không có actions → không nút', () => {
    expect(keys(questionCard({ actions: undefined as any }), true)).toEqual([]);
  });
});

describe('cardActionLook', () => {
  it('primary → nền đặc; danger → viền đỏ; còn lại → viền trung tính', () => {
    expect(cardActionLook('primary')).toEqual({ variant: 'solid', action: 'primary' });
    expect(cardActionLook('danger')).toEqual({ variant: 'outline', action: 'error' });
    expect(cardActionLook('default')).toEqual({ variant: 'outline', action: 'neutral' });
    expect(cardActionLook(null)).toEqual({ variant: 'outline', action: 'neutral' });
  });
});

describe('cardTargetRoute — thẻ mở màn nào trên app', () => {
  it('phiếu → chi tiết phiếu; việc → chi tiết việc', () => {
    expect(cardTargetRoute(approvalCard())).toBe(`/agent/approvals/${ACTION_ID}`);
    expect(cardTargetRoute(questionCard())).toBe(`/agent/tasks/${TASK_ID}`);
    expect(cardTargetRoute(questionCard({ kind: 'task_result' }))).toBe(`/agent/tasks/${TASK_ID}`);
  });

  it('refId dạng Guid "N" (32 ký tự liền) vẫn mở đúng phiếu', () => {
    expect(dashedGuid(ACTION_ID.replace(/-/g, ''))).toBe(ACTION_ID);
    expect(cardTargetRoute(approvalCard({ refId: ACTION_ID.replace(/-/g, '') }))).toBe(`/agent/approvals/${ACTION_ID}`);
  });

  it('refId hỏng → đổi link web bằng notification-links; không đổi được → danh sách', () => {
    expect(cardTargetRoute(approvalCard({ refId: 'x' }))).toBe('/agent/approvals');
    expect(cardTargetRoute(questionCard({ refId: 'x', link: '/dashboard/agent/center' }))).toBe('/agent/tasks');
    expect(cardTargetRoute(questionCard({ refId: 'x', link: 'https://evil.example/x' }))).toBe('/agent/tasks');
    expect(cardTargetRoute(approvalCard({ refId: 'x', link: null }))).toBe('/agent/approvals');
  });
});

describe('cardErrorInfo — lỗi khi bấm nút', () => {
  it('403 → không có quyền, không nạp lại', () => {
    expect(cardErrorInfo({ status: 403, error: 'forbidden' })).toEqual({
      message: t('chat.card.noPermission'),
      reload: false,
      changed: false,
    });
  });

  it('409 → câu của máy chủ (detail → title → message), nạp lại', () => {
    expect(cardErrorInfo({ status: 409, detail: 'Phiếu đã được xử lý.', title: 'Conflict' })).toEqual({
      message: 'Phiếu đã được xử lý.',
      reload: true,
      changed: true,
    });
    expect(cardErrorInfo({ status: 409, title: 'Phiếu đã hết hạn.' }).message).toBe('Phiếu đã hết hạn.');
    expect(cardErrorInfo({ status: 409, message: 'Đã có người duyệt.' }).message).toBe('Đã có người duyệt.');
    expect(cardErrorInfo({ status: 404, title: 'Không tìm thấy phiếu.' }).reload).toBe(true);
  });

  it('lỗi khác → câu chung, không nạp lại', () => {
    const info = cardErrorInfo('Network Error');
    expect(info.reload).toBe(false);
    expect(info.message).toMatch(/mạng/i);
  });
});

describe('nhóm hệ thống + người gửi hệ thống', () => {
  it('tên + icon theo systemKey', () => {
    expect(systemConversationName('agent-admin')).toBe(t('chat.system.agentAdmin'));
    expect(systemConversationName('admin-alerts')).toBe(t('chat.system.adminAlerts'));
    expect(systemConversationName(null)).toBeNull();
    expect(systemConversationIcon('agent-admin')).toBe('robot-outline');
    expect(systemConversationIcon('admin-alerts')).toBe('bell-outline');
    expect(systemConversationIcon(undefined)).toBeNull();
  });

  it('người gửi hệ thống luôn có tên (kể cả id viết hoa, danh bạ không có); loại khỏi danh sách chọn người', () => {
    expect(senderDisplayName(SYSTEM_USER_ID.toUpperCase(), undefined)).toBe(t('chat.system.sender'));
    expect(senderDisplayName('u1', { fullName: 'Lan' })).toBe('Lan');
    expect(senderDisplayName('u2', undefined)).toBeNull();
    expect(excludeSystemUsers([{ id: SYSTEM_USER_ID }, { id: 'u1' }, { id: 'u3', isSystem: true }]).map((u) => u.id)).toEqual(['u1']);
  });
});
