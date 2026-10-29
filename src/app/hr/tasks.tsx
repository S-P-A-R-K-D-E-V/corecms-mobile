import { Redirect } from 'expo-router';

// Nhiệm vụ đã gộp vào Việc được giao (màn /cleaning) — link cũ chuyển sang đó.
export default function HrTasks() {
  return <Redirect href={'/cleaning' as any} />;
}
