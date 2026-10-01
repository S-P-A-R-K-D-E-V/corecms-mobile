import { Stack } from 'expo-router';

// Như các tab khác (chat, payroll, schedule): thiếu _layout thì route trong Tabs mang tên "assistant/index"
// chứ không phải "assistant" — thanh tab tra route theo tên nên bấm tab Trợ lý không làm gì.
export default function AssistantLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
