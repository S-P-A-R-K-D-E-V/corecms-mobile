import type { InternalUser } from 'src/api/messenger';
import {
  addableUsers,
  agentAccessOf,
  agentMemberChip,
  canAddMembers,
  canLeaveGroup,
  canRemoveMember,
  hasMembersPanel,
  memberErrorMessage,
  memberName,
  peopleCount,
  sortMemberIds,
  typingLabel,
} from '../group-members';
import { SYSTEM_USER_ID } from '../messenger-system';

const ME = 'u-me';
const AN = 'u-an';
const BINH = 'u-binh';
const CHI = 'u-chi';
const SYS = SYSTEM_USER_ID;

const user = (id: string, fullName: string, extra: Partial<InternalUser> = {}): InternalUser => ({
  id,
  fullName,
  email: `${id}@cici.vn`,
  avatarUrl: null,
  online: false,
  ...extra,
});

const cache: Record<string, InternalUser> = {
  [ME]: user(ME, 'Vũ Xuân Bình'),
  [AN]: user(AN, 'Nguyễn An Xing'),
  [BINH]: user(BINH, 'Đỗ Trà My'),
  [CHI]: user(CHI, 'Lê Chi'),
  [SYS]: user(SYS, 'Trợ lý hệ thống', { isSystem: true }),
};

const group = (extra: Record<string, unknown> = {}) => ({
  type: 'Group' as const,
  systemKey: null as string | null,
  participantIds: [ME, AN, BINH],
  createdById: ME as string | null | undefined,
  ...extra,
});
const agentAdmin = (extra: Record<string, unknown> = {}) =>
  group({ systemKey: 'agent-admin', participantIds: [ME, AN, SYS], createdById: SYS, ...extra });
const alerts = () => group({ systemKey: 'admin-alerts', participantIds: [ME, AN, SYS] });
const privateChat = () => ({ type: 'Private' as const, participantIds: [ME, AN] });

const plain = { currentUserId: ME, canManageAgents: false };
const manager = { currentUserId: ME, canManageAgents: true };

describe('hasMembersPanel', () => {
  it('nhóm thường + nhóm Quản trị có, tin riêng / kênh cảnh báo không', () => {
    expect(hasMembersPanel(group())).toBe(true);
    expect(hasMembersPanel(group({ type: 1 }))).toBe(true); // BE cũ trả enum dạng số
    expect(hasMembersPanel(agentAdmin())).toBe(true);
    expect(hasMembersPanel(alerts())).toBe(false);
    expect(hasMembersPanel(privateChat())).toBe(false);
    expect(hasMembersPanel(undefined)).toBe(false);
  });
});

describe('nhóm thường', () => {
  it('ai trong nhóm cũng thêm được; người ngoài nhóm thì không', () => {
    expect(canAddMembers(group({ createdById: AN }), plain)).toBe(true);
    expect(canAddMembers(group({ participantIds: [AN, BINH] }), plain)).toBe(false);
  });

  it('chỉ người tạo gỡ được người khác', () => {
    expect(canRemoveMember(group(), AN, plain)).toBe(true);
    expect(canRemoveMember(group({ createdById: AN }), BINH, plain)).toBe(false);
    // quyền agent.manage không liên quan nhóm thường
    expect(canRemoveMember(group({ createdById: AN }), BINH, manager)).toBe(false);
  });

  it('chưa biết người tạo → vẫn hiện Gỡ, máy chủ quyết định', () => {
    expect(canRemoveMember(group({ createdById: undefined }), AN, plain)).toBe(true);
    expect(canRemoveMember(group({ createdById: null }), AN, plain)).toBe(true);
  });

  it('không Gỡ chính mình (dùng Rời nhóm), Trợ lý hệ thống, người không trong nhóm', () => {
    expect(canRemoveMember(group(), ME, plain)).toBe(false);
    expect(canRemoveMember(group({ participantIds: [ME, AN, SYS] }), SYS, plain)).toBe(false);
    expect(canRemoveMember(group(), CHI, plain)).toBe(false);
  });

  it('so id không phân biệt hoa thường (Guid)', () => {
    expect(canRemoveMember(group({ createdById: ME.toUpperCase() }), AN, plain)).toBe(true);
  });
});

describe('nhóm Quản trị – Đội agent', () => {
  it('thêm / gỡ người khác cần agent.manage', () => {
    expect(canAddMembers(agentAdmin(), plain)).toBe(false);
    expect(canAddMembers(agentAdmin(), manager)).toBe(true);
    expect(canRemoveMember(agentAdmin(), AN, plain)).toBe(false);
    expect(canRemoveMember(agentAdmin(), AN, manager)).toBe(true);
  });

  it('không bao giờ gỡ Trợ lý hệ thống', () => {
    expect(canRemoveMember(agentAdmin(), SYS, manager)).toBe(false);
  });

  it('ai cũng tự rời được', () => {
    expect(canLeaveGroup(agentAdmin(), ME)).toBe(true);
    expect(canLeaveGroup(group(), ME)).toBe(true);
  });
});

describe('canLeaveGroup', () => {
  it('chỉ khi đang trong nhóm và nhóm có màn thành viên', () => {
    expect(canLeaveGroup(group({ participantIds: [AN, BINH] }), ME)).toBe(false);
    expect(canLeaveGroup(alerts(), ME)).toBe(false);
    expect(canLeaveGroup(privateChat(), ME)).toBe(false);
    expect(canLeaveGroup(group(), null)).toBe(false);
  });
});

describe('nhãn giao việc cho CEO', () => {
  const opts = { currentUserId: ME, selfCanApprove: false, approverIds: [AN.toUpperCase()] };

  it('người khác theo approverIds của máy chủ', () => {
    expect(agentAccessOf(AN, opts)).toBe('approve');
    expect(agentAccessOf(BINH, opts)).toBe('view');
  });

  it('chính mình theo quyền đã tải, kể cả khi không có approverIds', () => {
    expect(agentAccessOf(ME, opts)).toBe('view');
    expect(agentAccessOf(ME, { ...opts, selfCanApprove: true, approverIds: null })).toBe('approve');
  });

  it('không biết approverIds (người chỉ xem không gọi được API) → không gắn nhãn người khác', () => {
    const access = agentAccessOf(AN, { ...opts, approverIds: null });
    expect(access).toBe('unknown');
    expect(agentMemberChip(AN, access)).toBeNull();
  });

  it('chip theo quyền; Trợ lý hệ thống không có chip', () => {
    expect(agentMemberChip(AN, 'approve')).toEqual({ label: 'Giao việc được cho CEO', color: 'success' });
    expect(agentMemberChip(BINH, 'view')).toEqual({ label: 'Chỉ xem', color: 'default' });
    expect(agentAccessOf(SYS, { ...opts, approverIds: [SYS] })).toBe('unknown');
    expect(agentMemberChip(SYS, 'approve')).toBeNull();
  });
});

describe('danh sách thành viên', () => {
  it('mình trước, người khác theo tên (Đ sau D, trước L), Trợ lý hệ thống cuối', () => {
    expect(sortMemberIds([SYS, AN, CHI, ME, BINH], ME, cache)).toEqual([ME, BINH, CHI, AN, SYS]);
  });

  it('người không có trong danh bạ vẫn có tên', () => {
    expect(memberName('u-ghost', cache)).toBe('Người dùng');
    expect(memberName(SYS, {})).toBe('Trợ lý hệ thống');
  });

  it('đếm người không tính Trợ lý hệ thống', () => {
    expect(peopleCount([ME, AN, SYS], cache)).toBe(2);
  });
});

describe('addableUsers', () => {
  const users = Object.values(cache);

  it('bỏ người đã trong nhóm + Trợ lý hệ thống, xếp theo tên', () => {
    expect(addableUsers(users, [ME, AN]).map((u) => u.id)).toEqual([BINH, CHI]);
  });

  it('bỏ cả tài khoản hệ thống chỉ nhận ra theo id', () => {
    const noFlag = { ...cache[SYS], isSystem: undefined };
    expect(addableUsers([noFlag, cache[CHI]], [ME]).map((u) => u.id)).toEqual([CHI]);
  });

  it('lọc theo tên hoặc email', () => {
    expect(addableUsers(users, [ME], 'trà').map((u) => u.id)).toEqual([BINH]);
    expect(addableUsers(users, [ME], 'u-chi@').map((u) => u.id)).toEqual([CHI]);
    expect(addableUsers(users, [ME], 'không có')).toEqual([]);
  });
});

describe('typingLabel', () => {
  const base = { currentUserId: ME, userCache: cache };

  it('không ai gõ (hoặc chỉ mình) → rỗng', () => {
    expect(typingLabel([], { ...base, conversation: group() })).toBe('');
    expect(typingLabel([ME], { ...base, conversation: group() })).toBe('');
  });

  it('nhóm Quản trị: Trợ lý hệ thống gõ = CEO đang soạn', () => {
    expect(typingLabel([SYS], { ...base, conversation: agentAdmin() })).toBe('CEO đang soạn…');
    expect(typingLabel([SYS, AN], { ...base, conversation: agentAdmin() })).toBe('CEO đang soạn… · Xing đang nhập...');
  });

  it('nhóm thường: tên người đang gõ', () => {
    expect(typingLabel([AN, BINH], { ...base, conversation: group() })).toBe('Xing, My đang nhập...');
  });

  it('nhóm khác có Trợ lý hệ thống gõ → không gọi là CEO', () => {
    expect(typingLabel([SYS], { ...base, conversation: alerts() })).toBe('Trợ lý hệ thống đang nhập...');
  });

  it('tin riêng: câu chung như trước', () => {
    expect(typingLabel([AN], { ...base, conversation: privateChat() })).toBe('Đang nhập...');
  });
});

describe('memberErrorMessage', () => {
  it('ưu tiên câu `error` của máy chủ', () => {
    expect(
      memberErrorMessage({ error: 'Chỉ người có quyền quản lý đội agent mới thêm người.', code: 'agent_admin_manage', status: 403 }, 'x')
    ).toBe('Chỉ người có quyền quản lý đội agent mới thêm người.');
  });

  it('403 body rỗng (interceptor) → câu tiếng Việt của interceptor, không phải mã', () => {
    expect(
      memberErrorMessage({ status: 403, error: 'forbidden', message: 'Bạn không có quyền thực hiện thao tác này.' }, 'x')
    ).toBe('Bạn không có quyền thực hiện thao tác này.');
  });

  it('không đọc được gì → câu dự phòng', () => {
    expect(memberErrorMessage({}, 'Không gỡ được.')).toBe('Không gỡ được.');
    expect(memberErrorMessage(null, 'Không gỡ được.')).toBe('Không gỡ được.');
  });
});
