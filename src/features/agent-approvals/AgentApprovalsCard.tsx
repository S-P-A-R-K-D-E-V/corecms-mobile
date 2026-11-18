import { View } from 'react-native';
import { router } from 'expo-router';

import { CountBadge, Icon, Pressable, Text } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { canApproveAgentActions } from 'src/auth/permissions';

import { useAgentPendingCount } from './hooks';

// ----------------------------------------------------------------------
// Thẻ "Agent xin duyệt" ở trang chủ / dashboard: chỉ người có agent.approve, chỉ khi có phiếu đang chờ. Bấm → màn Duyệt
// việc agent. API lỗi (core-be chưa có) → ẩn.
// ----------------------------------------------------------------------

export function AgentApprovalsCard() {
  const { user } = useAuthContext();
  const allowed = canApproveAgentActions(user);
  const { data: count } = useAgentPendingCount(allowed);
  if (!allowed || !count) return null;

  return (
    <Pressable
      onPress={() => router.push('/agent/approvals' as any)}
      accessibilityRole="button"
      accessibilityLabel={`${count} việc agent chờ duyệt`}
      className="flex-row items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3"
    >
      <View className="w-10 h-10 rounded-xl items-center justify-center bg-surface dark:bg-surface-dark">
        <Icon name="robot-outline" size={22} tone="warning" />
      </View>
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold">Agent xin duyệt</Text>
        <Text variant="caption" tone="muted">{count} việc đang chờ bạn duyệt trước khi chạy</Text>
      </View>
      <CountBadge count={count} size="md" />
      <Icon name="chevron-right" size={20} tone="muted" />
    </Pressable>
  );
}
