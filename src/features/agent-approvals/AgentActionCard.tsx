import { View } from 'react-native';
import dayjs from 'dayjs';

import { Badge, Card, Icon, Pressable, Text } from 'src/components/ui';
import type { AgentActionView } from 'src/api/agent-actions';

import { actionParams, isExpiringSoon, isResultSuccess, methodLabel, statusInfo, timeLeftText } from './agent-action-format';

// ----------------------------------------------------------------------
// Một phiếu agent xin làm trong danh sách: agent nào, làm thay ai, việc gì, quyền, vài tham số đầu, còn bao lâu hết hạn.
// ----------------------------------------------------------------------

const PREVIEW_PARAMS = 4;

/** "Agent bán hàng · làm thay Lan" */
export function agentLine(action: AgentActionView): string {
  return action.actsForName ? `${action.agentName} · làm thay ${action.actsForName}` : action.agentName;
}

export function AgentActionCard({ action, now, onPress }: { action: AgentActionView; now: number; onPress: () => void }) {
  const status = statusInfo(action.status);
  const pending = action.status === 'pending';
  const params = actionParams(action.bodyJson);
  const preview = params?.slice(0, PREVIEW_PARAMS) ?? [];
  const more = params ? params.length - preview.length : 0;
  const soon = pending && isExpiringSoon(action.expiresAt, now);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${agentLine(action)}: ${action.summary}`}>
      <Card className="p-4 gap-2">
        <View className="flex-row items-center gap-2">
          <View className="w-9 h-9 rounded-xl items-center justify-center bg-secondary-soft">
            <Icon name="robot-outline" size={20} tone="secondary" />
          </View>
          <View className="flex-1 min-w-0">
            <Text variant="bodySmall" className="font-semibold" numberOfLines={1}>
              {action.agentName}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {action.actsForName ? `Làm thay ${action.actsForName}` : 'Không làm thay ai'} · {dayjs(action.createdAt).format('HH:mm DD/MM')}
            </Text>
          </View>
          <Badge tone={status.tone}>{status.label}</Badge>
        </View>

        <Text variant="body" numberOfLines={3}>
          {action.summary || `${methodLabel(action.method)} ${action.pathAndQuery}`}
        </Text>

        <View className="flex-row flex-wrap items-center gap-1.5">
          <Badge tone="info" icon="shield-key-outline">{action.permission}</Badge>
          <Badge tone="neutral">{methodLabel(action.method)}</Badge>
        </View>

        {params === null ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            Tham số: {action.bodyJson}
          </Text>
        ) : preview.length > 0 ? (
          <View className="rounded-xl bg-ink/5 dark:bg-white/5 px-3 py-2 gap-0.5">
            {preview.map((p, i) => (
              <Text key={`${p.key}-${i}`} variant="caption" numberOfLines={1}>
                <Text variant="caption" tone="muted">{p.key}: </Text>
                {p.value}
              </Text>
            ))}
            {more > 0 ? (
              <Text variant="caption" tone="faint">+ {more} tham số khác — mở để xem đủ</Text>
            ) : null}
          </View>
        ) : null}

        <View className="flex-row items-center gap-1.5">
          {pending ? (
            <>
              <Icon name="timer-sand" size={14} tone={soon ? 'error' : 'muted'} />
              <Text variant="caption" tone={soon ? 'error' : 'muted'} className={soon ? 'font-semibold flex-1' : 'flex-1'}>
                {timeLeftText(action.expiresAt, now)}
              </Text>
            </>
          ) : (
            <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
              {action.decidedByName ? `${action.decidedByName} · ` : ''}
              {action.decidedAt ? dayjs(action.decidedAt).format('HH:mm DD/MM') : ''}
              {action.status === 'executed' || action.status === 'failed'
                ? ` · ${isResultSuccess(action) ? 'thành công' : 'lỗi'}${action.resultStatusCode ? ` (${action.resultStatusCode})` : ''}`
                : ''}
            </Text>
          )}
          <Icon name="chevron-right" size={18} tone="muted" />
        </View>
      </Card>
    </Pressable>
  );
}
