import { useEffect, useSyncExternalStore } from 'react';

import { fetchCapabilities } from 'src/api/assistant';
import { isMultiStore, getHostApi } from 'src/services/store-config';
import { canUseAssistant, assistantEnabled } from 'src/auth/roles';
import type { AuthUser } from 'src/auth/auth-context';

// ----------------------------------------------------------------------
// Ai thấy Trợ lý AI. Chủ / quản lý / vai trò có quyền báo cáo, tiền (canUseAssistant) biết ngay từ user. Nhân viên
// thường ở bản cửa hàng thì hỏi máy chủ (GET /chatbot/capabilities): cửa hàng có trợ lý cho nhân viên (CiCi: tầng
// cici_staff) thì enabled=true, cửa hàng khác trả role_not_allowed / feature_off → vẫn ẩn. Kết quả nhớ theo
// cửa hàng + người dùng trong phiên app, để ô tiện ích (hàm đồng bộ) đọc được.
// ----------------------------------------------------------------------

type Entry = { key: string; allowed: boolean };

let entry: Entry | null = null;
let inFlight: string | null = null;
const listeners = new Set<() => void>();

function keyOf(user: AuthUser | null | undefined): string | null {
  if (!user?.id) return null;
  return `${getHostApi()}|${user.id}`;
}

function emit() {
  listeners.forEach((l) => l());
}

/** Người này có cần hỏi máy chủ không (không đủ quyền theo user nhưng bản cửa hàng có thể có trợ lý nhân viên). */
function needsServerCheck(user: AuthUser | null | undefined): boolean {
  return isMultiStore && !!user && !canUseAssistant(user);
}

/** Đồng bộ: thấy Trợ lý AI không (dùng cho ô tiện ích, nút trên Trang chủ, chặn route). */
export function canOpenAssistant(user: AuthUser | null | undefined): boolean {
  if (canUseAssistant(user)) return assistantEnabled(user);
  const key = keyOf(user);
  return !!key && entry?.key === key && entry.allowed;
}

/** Máy chủ đã trả lời cho người này chưa (để màn chặn route không báo "không có quyền" khi còn đang hỏi). */
export function assistantAccessKnown(user: AuthUser | null | undefined): boolean {
  if (!needsServerCheck(user)) return true;
  const key = keyOf(user);
  return !!key && entry?.key === key;
}

export async function refreshAssistantAccess(user: AuthUser | null | undefined): Promise<void> {
  if (!needsServerCheck(user)) return;
  const key = keyOf(user);
  if (!key || entry?.key === key || inFlight === key) return;
  inFlight = key;
  let allowed = false;
  try {
    const caps = await fetchCapabilities();
    allowed = !!caps?.enabled;
  } catch {
    allowed = false;
  } finally {
    inFlight = null;
  }
  entry = { key, allowed };
  emit();
}

/** Hook: trả canOpenAssistant(user) và tự hỏi máy chủ một lần khi cần; re-render khi có kết quả. */
export function useAssistantAccess(user: AuthUser | null | undefined): { allowed: boolean; known: boolean } {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => entry,
    () => entry
  );
  const key = keyOf(user);
  useEffect(() => {
    void refreshAssistantAccess(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { allowed: canOpenAssistant(user), known: assistantAccessKnown(user) };
}

/** Chỉ cho test. */
export function __resetAssistantAccess() {
  entry = null;
  inFlight = null;
}
