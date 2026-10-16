import { Stack } from 'expo-router';

import { RoleGuardFallback } from 'src/auth/role-guard';
import { useAuthContext } from 'src/auth/auth-context';
import { canUseAssistant } from 'src/auth/roles';

// Như các tab khác (chat, payroll, schedule): thiếu _layout thì route trong Tabs mang tên "assistant/index"
// chứ không phải "assistant" — thanh tab tra route theo tên nên bấm tab Trợ lý không làm gì.
// Ô tiện ích / trang chủ đã ẩn Trợ lý với người không dùng được (canUseAssistant); chặn cả khi mở bằng link.
export default function AssistantLayout() {
  const { user } = useAuthContext();

  if (!canUseAssistant(user)) return <RoleGuardFallback />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
