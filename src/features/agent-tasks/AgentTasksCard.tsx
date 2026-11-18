import { View } from 'react-native';
import { router } from 'expo-router';

import { CountBadge, Icon, Pressable, Text } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { canApproveAgentActions } from 'src/auth/permissions';

import { AGENT_TASKS_ROUTE, runningCardCounts } from './agent-task-format';
import { useAgentCenterSummary, useScreenActive } from './hooks';

// ----------------------------------------------------------------------
// Thẻ "Agent đang chạy" ở trang chủ / dashboard: chỉ người có agent.approve, chỉ khi có việc đang chạy hoặc chờ người.
// Làm mới 30 giây khi màn đang hiện. API lỗi (core-be chưa có) → ẩn. Bấm → màn Việc của agent.
// ----------------------------------------------------------------------

export function AgentTasksCard() {
  const { user } = useAuthContext();
  const allowed = canApproveAgentActions(user);
  const active = useScreenActive();
  const { data } = useAgentCenterSummary(allowed, active);
  const counts = runningCardCounts(data);
  if (!allowed || !counts) return null;

  const parts = [
    counts.running > 0 ? `${counts.running} việc đang chạy` : null,
    counts.waitingHuman > 0 ? `${counts.waitingHuman} việc chờ bạn trả lời` : null,
  ].filter(Boolean);
  const waiting = counts.waitingHuman > 0;

  return (
    <Pressable
      onPress={() => router.push(AGENT_TASKS_ROUTE as any)}
      accessibilityRole="button"
      accessibilityLabel={`Agent đang chạy: ${parts.join(', ')}`}
      className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${
        waiting ? 'border-warning/30 bg-warning-soft' : 'border-secondary/30 bg-secondary-soft'
      }`}
    >
      <View className="w-10 h-10 rounded-xl items-center justify-center bg-surface dark:bg-surface-dark">
        <Icon name="robot-industrial-outline" size={22} tone={waiting ? 'warning' : 'secondary'} />
      </View>
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold">Agent đang chạy</Text>
        <Text variant="caption" tone="muted">{parts.join(' · ')}</Text>
      </View>
      {waiting ? <CountBadge count={counts.waitingHuman} size="md" /> : null}
      <Icon name="chevron-right" size={20} tone="muted" />
    </Pressable>
  );
}
