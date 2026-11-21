import { Redirect, useLocalSearchParams } from 'expo-router';

import { legacyWorkRedirect } from 'src/features/work-center/work-center';

// Màn cũ đã gộp vào Công việc (docs/cici/plans/cong-viec-mot-cho-plan.md) — giữ route để link / thông báo / ghim cũ vẫn mở đúng.
export default function LegacyCleaningBuilder() {
  const params = useLocalSearchParams();
  return <Redirect href={legacyWorkRedirect('cleaning-builder', params) as any} />;
}
