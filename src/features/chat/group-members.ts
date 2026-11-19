import { isGroupConversation, type ConversationType, type InternalUser } from 'src/api/messenger';
import { extractApiError } from 'src/services/error';
import { t } from 'src/i18n';

import {
  isAgentAdminConversation,
  isSystemConversation,
  isSystemUser,
  isSystemUserId,
  senderDisplayName,
} from './messenger-system';

// ----------------------------------------------------------------------
// Màn "Thành viên" của nhóm Messenger (A4 — bản app của core-fe src/utils/messenger-members.ts). Luật hiện / ẩn nút khớp
// core-be (MessengerService.AddMembersAsync / RemoveMemberAsync):
// - Nhóm thường: ai trong nhóm cũng thêm được; chỉ người tạo nhóm gỡ được người khác; ai cũng tự rời được.
// - Nhóm "Quản trị – Đội agent" (systemKey agent-admin): thêm / gỡ người khác cần agent.manage; ai cũng tự rời.
// - Kênh hệ thống khác (vd "Cảnh báo hệ thống"): tự đồng bộ theo vai trò — không có màn thành viên.
// - Không bao giờ thêm / gỡ "Trợ lý hệ thống".
// Ẩn nút chỉ để gọn giao diện — máy chủ vẫn quyết định, lỗi 400 / 403 vẫn phải báo.
// ----------------------------------------------------------------------

export type MembersConversation = {
  type: ConversationType | number | (string & {});
  systemKey?: string | null;
  participantIds: string[];
  /** Danh sách hội thoại mới có; máy chủ cũ thiếu → không biết người tạo. */
  createdById?: string | null;
};

export type MemberActor = {
  currentUserId: string | null;
  /** hasPermission(user, PERMISSIONS.agent.manage) của người đang xem. */
  canManageAgents: boolean;
};

/** Hội thoại có nút "Thành viên": nhóm thường + nhóm Quản trị; không phải tin riêng, không phải kênh hệ thống khác. */
export function hasMembersPanel(conversation: MembersConversation | null | undefined): boolean {
  if (!conversation || !isGroupConversation(conversation.type as ConversationType)) return false;
  return !isSystemConversation(conversation) || isAgentAdminConversation(conversation);
}

function isMember(conversation: MembersConversation, userId: string | null): boolean {
  return !!userId && conversation.participantIds.some((id) => id.toLowerCase() === userId.toLowerCase());
}

export function canAddMembers(conversation: MembersConversation | null | undefined, actor: MemberActor): boolean {
  if (!conversation || !hasMembersPanel(conversation) || !isMember(conversation, actor.currentUserId)) return false;
  return isAgentAdminConversation(conversation) ? actor.canManageAgents : true;
}

/**
 * Gỡ NGƯỜI KHÁC (tự rời dùng {@link canLeaveGroup}). Nhóm thường mà chưa biết người tạo (máy chủ cũ chưa trả createdById)
 * → vẫn hiện nút, máy chủ quyết định và báo lỗi nếu không được.
 */
export function canRemoveMember(
  conversation: MembersConversation | null | undefined,
  memberId: string,
  actor: MemberActor
): boolean {
  if (!conversation || !hasMembersPanel(conversation) || !actor.currentUserId) return false;
  if (isSystemUserId(memberId) || memberId === actor.currentUserId) return false;
  if (!isMember(conversation, memberId) || !isMember(conversation, actor.currentUserId)) return false;
  if (isAgentAdminConversation(conversation)) return actor.canManageAgents;
  if (!conversation.createdById) return true;
  return conversation.createdById.toLowerCase() === actor.currentUserId.toLowerCase();
}

export function canLeaveGroup(conversation: MembersConversation | null | undefined, currentUserId: string | null): boolean {
  return !!conversation && hasMembersPanel(conversation) && isMember(conversation, currentUserId);
}

/** Tên hiện của một thành viên (Trợ lý hệ thống luôn có tên; người không có trong danh bạ → "Người dùng"). */
export function memberName(memberId: string, userCache: Record<string, InternalUser>): string {
  return senderDisplayName(memberId, userCache[memberId]) || t('chat.members.unknownUser');
}

/** Thứ tự hiện: mình trước, người khác theo tên, Trợ lý hệ thống cuối. */
export function sortMemberIds(
  participantIds: string[],
  currentUserId: string | null,
  userCache: Record<string, InternalUser>
): string[] {
  const rank = (id: string) => {
    if (id === currentUserId) return 0;
    if (isSystemUserId(id) || userCache[id]?.isSystem) return 2;
    return 1;
  };
  return [...participantIds].sort(
    (a, b) => rank(a) - rank(b) || memberName(a, userCache).localeCompare(memberName(b, userCache), 'vi')
  );
}

/** Người trong danh bạ cửa hàng chưa ở trong nhóm (bỏ Trợ lý hệ thống), lọc theo ô tìm (tên / email), xếp theo tên. */
export function addableUsers(users: InternalUser[], participantIds: string[], search = ''): InternalUser[] {
  const inGroup = new Set(participantIds.map((id) => id.toLowerCase()));
  const q = search.trim().toLowerCase();
  return users
    .filter((u) => !isSystemUser(u) && !inGroup.has(u.id.toLowerCase()))
    .filter((u) => !q || u.fullName.toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));
}

/** Số người thật trong nhóm (không đếm Trợ lý hệ thống). */
export function peopleCount(participantIds: string[], userCache: Record<string, InternalUser>): number {
  return participantIds.filter((id) => !isSystemUserId(id) && !userCache[id]?.isSystem).length;
}

// ----------------------------------------------------------------------
// Nhãn "Giao việc được cho CEO" (nhóm Quản trị). Danh bạ messenger không có quyền của người khác:
// - chính mình: theo quyền đã tải của tài khoản (agent.approve);
// - người khác: `approverIds` của GET agent-center/admin-group (chỉ người có agent.approve gọi được);
// - không biết → 'unknown' (không gắn nhãn, màn hình vẫn có ghi chú chung).
// ----------------------------------------------------------------------

export type AgentAccess = 'approve' | 'view' | 'unknown';

export function agentAccessOf(
  memberId: string,
  opts: { currentUserId: string | null; selfCanApprove: boolean; approverIds: string[] | null | undefined }
): AgentAccess {
  if (isSystemUserId(memberId)) return 'unknown';
  if (memberId === opts.currentUserId) return opts.selfCanApprove ? 'approve' : 'view';
  if (!opts.approverIds) return 'unknown';
  const id = memberId.toLowerCase();
  return opts.approverIds.some((a) => a.toLowerCase() === id) ? 'approve' : 'view';
}

export type AgentMemberChip = { label: string; color: 'success' | 'default' };

/** Nhãn của một người trong nhóm Quản trị; null = không gắn (Trợ lý hệ thống, hoặc chưa biết quyền). */
export function agentMemberChip(memberId: string, access: AgentAccess): AgentMemberChip | null {
  if (isSystemUserId(memberId)) return null;
  if (access === 'approve') return { label: t('chat.members.chipApprove'), color: 'success' };
  if (access === 'view') return { label: t('chat.members.chipView'), color: 'default' };
  return null;
}

// ----------------------------------------------------------------------
// Dòng "đang nhập…" ở đầu màn chat. Trong nhóm Quản trị, Trợ lý hệ thống gõ = agent CEO đang soạn trả lời (A4b).
// ----------------------------------------------------------------------

function shortName(user: InternalUser | undefined): string {
  return user?.fullName?.trim().split(/\s+/).at(-1) || '...';
}

export function typingLabel(
  typingIds: string[],
  opts: {
    currentUserId: string | null | undefined;
    conversation: (MembersConversation & { systemKey?: string | null }) | null | undefined;
    userCache: Record<string, InternalUser>;
  }
): string {
  const others = typingIds.filter((id) => id !== opts.currentUserId);
  if (others.length === 0) return '';

  const ceo = isAgentAdminConversation(opts.conversation) && others.some(isSystemUserId);
  const rest = others.filter((id) => !(ceo && isSystemUserId(id)));
  const parts: string[] = [];
  if (ceo) parts.push(t('chat.typing.ceo'));
  if (rest.length > 0) {
    const group = !!opts.conversation && isGroupConversation(opts.conversation.type as ConversationType);
    parts.push(
      group
        ? t('chat.typing.named', {
            names: rest.map((id) => (isSystemUserId(id) ? memberName(id, opts.userCache) : shortName(opts.userCache[id]))).join(', '),
          })
        : t('chat.typing.generic')
    );
  }
  return parts.join(' · ');
}

// ----------------------------------------------------------------------

/**
 * Lỗi từ POST / DELETE members: máy chủ trả `{ error, code }` (câu tiếng Việt ở `error`). Interceptor 403 body rỗng đặt
 * `error: 'forbidden'` + `message` → `error` chỉ dùng khi là câu (có khoảng trắng), còn lại để extractApiError xử lý.
 */
export function memberErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object') {
    const { error } = err as { error?: unknown };
    if (typeof error === 'string' && /\s/.test(error.trim())) return error.trim();
  }
  const msg = err ? extractApiError(err) : '';
  return msg && msg !== 'Vui lòng thử lại' ? msg : fallback;
}
