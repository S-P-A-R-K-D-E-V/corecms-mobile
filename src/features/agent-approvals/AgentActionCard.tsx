import { Image, View } from 'react-native';
import dayjs from 'dayjs';

import { Badge, Card, Icon, Pressable, Text } from 'src/components/ui';
import type { AgentActionView } from 'src/api/agent-actions';

import {
  actionParams,
  actionTitle,
  captionExcerpt,
  isExpiringSoon,
  isResultSuccess,
  methodLabel,
  socialPostOf,
  statusInfo,
  timeLeftText,
  versionLabel,
} from './agent-action-format';

// ----------------------------------------------------------------------
// Một phiếu agent xin làm trong danh sách: agent nào, làm thay ai, việc gì (tên thao tác tiếng Việt), bản xem trước ngắn
// (bài mạng xã hội: giờ đăng + trích caption + ảnh đầu; lệnh khác: vài dòng nhãn — giá trị), còn bao lâu hết hạn.
// ----------------------------------------------------------------------

const PREVIEW_PARAMS = 4;
const THUMB = 64;

/** "Agent bán hàng · làm thay Lan" */
export function agentLine(action: AgentActionView): string {
  return action.actsForName ? `${action.agentName} · làm thay ${action.actsForName}` : action.agentName;
}

/** Vài dòng "nhãn: giá trị" — từ preview.fields (BE đã dịch nhãn) hoặc, BE cũ, từ bodyJson. */
function ParamsPreview({ action }: { action: AgentActionView }) {
  const fields = action.preview?.kind === 'generic' ? action.preview.fields : null;
  const params = fields
    ? fields.map((f) => ({ key: f.label, value: f.value }))
    : action.preview
      ? []
      : actionParams(action.bodyJson);
  if (params === null) {
    return (
      <Text variant="caption" tone="muted" numberOfLines={2}>
        Tham số: {action.bodyJson}
      </Text>
    );
  }
  const shown = params.slice(0, PREVIEW_PARAMS);
  const more = params.length - shown.length;
  if (shown.length === 0) return null;
  return (
    <View className="rounded-xl bg-ink/5 dark:bg-white/5 px-3 py-2 gap-0.5">
      {shown.map((p, i) => (
        <Text key={`${p.key}-${i}`} variant="caption" numberOfLines={1}>
          <Text variant="caption" tone="muted">{p.key}: </Text>
          {p.value}
        </Text>
      ))}
      {more > 0 ? <Text variant="caption" tone="faint">+ {more} mục khác — mở để xem đủ</Text> : null}
    </View>
  );
}

export function AgentActionCard({ action, now, onPress }: { action: AgentActionView; now: number; onPress: () => void }) {
  const status = statusInfo(action.status);
  const pending = action.status === 'pending';
  const soon = pending && isExpiringSoon(action.expiresAt, now);
  const title = actionTitle(action);
  const post = socialPostOf(action);
  const version = versionLabel(action.version);
  const firstImage = post?.imageUrls[0];
  const excerpt = post ? captionExcerpt(post.text) : '';
  const channel = post?.channels[0];

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${agentLine(action)}: ${title}`}>
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

        <View className="flex-row items-start gap-2">
          <Text variant="body" className="font-semibold flex-1" numberOfLines={2}>
            {title}
          </Text>
          {version ? <Badge tone="secondary" icon="history">{version}</Badge> : null}
        </View>

        {post ? (
          <View className="flex-row gap-3 rounded-xl bg-ink/5 dark:bg-white/5 p-2.5">
            {firstImage ? (
              <View>
                <Image source={{ uri: firstImage }} style={{ width: THUMB, height: THUMB, borderRadius: 10 }} resizeMode="cover" />
                {post.imageUrls.length > 1 ? (
                  <View className="absolute right-1 bottom-1 rounded-full px-1.5" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
                    <Text className="text-white text-[11px] font-semibold">+{post.imageUrls.length - 1}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View className="flex-1 min-w-0 gap-1">
              {channel ? (
                <Text variant="caption" className="font-semibold" numberOfLines={1}>
                  {channel.name}
                  {post.channels.length > 1 ? ` +${post.channels.length - 1} kênh` : ''}
                </Text>
              ) : null}
              <Text variant="caption" numberOfLines={2}>{excerpt || '(Bài không có chữ)'}</Text>
              {post.modeLabel ? (
                <View className="flex-row items-center gap-1">
                  <Icon name={post.mode === 'now' ? 'send-outline' : 'clock-outline'} size={13} tone="info" />
                  <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">{post.modeLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : (
          <>
            {!action.preview ? (
              <View className="flex-row flex-wrap items-center gap-1.5">
                <Badge tone="info" icon="shield-key-outline">{action.permission}</Badge>
                <Badge tone="neutral">{methodLabel(action.method)}</Badge>
              </View>
            ) : null}
            <ParamsPreview action={action} />
          </>
        )}

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
