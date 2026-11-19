import type { IconName } from 'src/components/ui/icon';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// Người gửi hệ thống + hội thoại hệ thống của Messenger nội bộ (core-be SystemUser, SystemConversations; web:
// core-fe src/utils/messenger-system.ts). Tin cảnh báo / thẻ của đội agent do MỘT tài khoản hệ thống cố định gửi vào nhóm
// có systemKey của từng cửa hàng: "admin-alerts" (Cảnh báo hệ thống), "agent-admin" (Quản trị – Đội agent). Tài khoản đó
// không phải người để nhắn: hiện bằng tên + icon riêng, bị loại khỏi danh sách chọn người.
// ----------------------------------------------------------------------

/** Id cố định của tài khoản hệ thống (SystemUser.Id ở core-be). */
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

export const SYSTEM_KEYS = { adminAlerts: 'admin-alerts', agentAdmin: 'agent-admin' } as const;

/** core-be so id theo Guid nên hoa / thường đều là một. */
export function isSystemUserId(userId: string | null | undefined): boolean {
  return !!userId && userId.toLowerCase() === SYSTEM_USER_ID;
}

export function isSystemUser(user: { id: string; isSystem?: boolean } | null | undefined): boolean {
  return !!user && (user.isSystem === true || isSystemUserId(user.id));
}

/** Hội thoại do hệ thống quản lý (có systemKey). */
export function isSystemConversation(conversation: { systemKey?: string | null } | null | undefined): boolean {
  return !!conversation?.systemKey;
}

/** Tên của người gửi: hệ thống luôn có tên dù danh bạ không có mục của nó. */
export function senderDisplayName(userId: string, user: { fullName?: string | null; isSystem?: boolean } | null | undefined): string | null {
  if (isSystemUserId(userId) || user?.isSystem) return user?.fullName?.trim() || t('chat.system.sender');
  return user?.fullName ?? null;
}

/** Tên hiện của nhóm hệ thống khi máy chủ không gửi tên. */
export function systemConversationName(systemKey: string | null | undefined): string | null {
  if (systemKey === SYSTEM_KEYS.agentAdmin) return t('chat.system.agentAdmin');
  if (systemKey === SYSTEM_KEYS.adminAlerts) return t('chat.system.adminAlerts');
  return null;
}

/** Dòng phụ dưới tên nhóm hệ thống ở đầu màn chat. */
export function systemConversationSubtitle(systemKey: string | null | undefined): string | null {
  if (systemKey === SYSTEM_KEYS.agentAdmin) return t('chat.system.agentAdminSubtitle');
  if (systemKey === SYSTEM_KEYS.adminAlerts) return t('chat.system.adminAlertsSubtitle');
  return systemKey ? t('chat.system.adminAlertsSubtitle') : null;
}

/** Icon thay avatar chữ cái: robot cho nhóm đội agent, chuông cho kênh cảnh báo. */
export function systemConversationIcon(systemKey: string | null | undefined): IconName | null {
  if (!systemKey) return null;
  return systemKey === SYSTEM_KEYS.agentAdmin ? 'robot-outline' : 'bell-outline';
}

/** Bỏ người gửi hệ thống khỏi danh sách người để chọn (nhắn mới, đang online…). */
export function excludeSystemUsers<T extends { id: string; isSystem?: boolean }>(users: T[]): T[] {
  return users.filter((u) => !isSystemUser(u));
}
