import { View } from 'react-native';
import dayjs from 'dayjs';

import { Badge, Card, Icon, Pressable, Text } from 'src/components/ui';
import type { AgentTaskView } from 'src/api/agent-center';

import {
  elapsedMs,
  formatDuration,
  formatTokens,
  isLiveStatus,
  planProgress,
  taskStatusInfo,
  totalTokens,
} from './agent-task-format';

// ----------------------------------------------------------------------
// Một việc trong danh sách: agent, tên việc, trạng thái, bước hiện tại, tiến độ kế hoạch, thời gian chạy, token.
// ----------------------------------------------------------------------

export function AgentTaskCard({ task, now, onPress }: { task: AgentTaskView; now: number; onPress: () => void }) {
  const status = taskStatusInfo(task.status);
  const progress = planProgress(task.plan);
  const elapsed = elapsedMs(task, now);
  const live = isLiveStatus(task.status);
  const tokens = totalTokens(task);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${task.agentName}: ${task.title}, ${status.label}`}>
      <Card className="p-4 gap-2">
        <View className="flex-row items-center gap-2">
          <View className="w-9 h-9 rounded-xl items-center justify-center bg-secondary-soft">
            <Icon name="robot-outline" size={20} tone="secondary" />
          </View>
          <View className="flex-1 min-w-0">
            <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>
              {task.agentName || 'Agent'}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {dayjs(task.createdAt).format('HH:mm DD/MM')}
              {task.createdByName ? ` · ${task.createdByName} giao` : ''}
            </Text>
          </View>
          <Badge tone={status.tone} icon={status.icon}>{status.label}</Badge>
        </View>

        <Text variant="body" className="font-semibold" numberOfLines={2}>
          {task.title || '(Chưa đặt tên)'}
        </Text>

        {task.currentStepLabel ? (
          <Text variant="caption" tone={live ? 'primary' : 'muted'} numberOfLines={2}>
            {task.currentStepLabel}
          </Text>
        ) : null}

        {task.status === 'failed' && task.error ? (
          <Text variant="caption" tone="error" numberOfLines={2}>
            {task.error}
          </Text>
        ) : null}

        {progress ? (
          <View className="gap-1">
            <View className="h-1.5 rounded-full bg-ink/10 dark:bg-white/10 overflow-hidden">
              <View
                className={task.status === 'failed' ? 'h-full bg-error' : 'h-full bg-primary'}
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </View>
            <Text variant="caption" tone="muted">
              Kế hoạch {progress.done}/{progress.total} bước
            </Text>
          </View>
        ) : null}

        <View className="flex-row items-center gap-3">
          <View className="flex-row items-center gap-1">
            <Icon name="timer-outline" size={14} tone="muted" />
            <Text variant="caption" tone="muted">
              {elapsed === null ? 'Chưa bắt đầu' : formatDuration(elapsed)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1 flex-1">
            <Icon name="counter" size={14} tone="muted" />
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {formatTokens(tokens)} token
            </Text>
          </View>
          <Icon name="chevron-right" size={18} tone="muted" />
        </View>
      </Card>
    </Pressable>
  );
}
