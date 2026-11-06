import { Stack } from 'expo-router';

import { RoleGuardFallback } from 'src/auth/role-guard';
import { useAuthContext } from 'src/auth/auth-context';
import { canUseAssistant } from 'src/auth/roles';
import { useAssistantAccess } from 'src/features/assistant/assistant-access';

// Như các tab khác (chat, payroll, schedule): thiếu _layout thì route trong Tabs mang tên "assistant/index"
// chứ không phải "assistant" — thanh tab tra route theo tên nên bấm tab Trợ lý không làm gì.
// Ô tiện ích / trang chủ đã ẩn Trợ lý với người không dùng được; chặn cả khi mở bằng link. Nhân viên thường ở bản
// cửa hàng: chờ máy chủ trả lời (assistant-access) rồi mới quyết định, để không báo nhầm "không có quyền".
export default function AssistantLayout() {
  const { user } = useAuthContext();
  const { allowed, known } = useAssistantAccess(user);

  if (!canUseAssistant(user) && known && !allowed) return <RoleGuardFallback />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
