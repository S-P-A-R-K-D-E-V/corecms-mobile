import { View } from 'react-native';

import { Icon } from 'src/components/ui';
import { ChatAvatar } from 'src/features/chat/ChatAvatar';
import type { ConversationSummary } from 'src/api/inbox';

// Ảnh đại diện khách + dấu kênh ở góc (Messenger / bình luận Facebook / kênh thử) như Meta Business Suite.

const MESSENGER = '#0A7CFF';
const FACEBOOK = '#1877F2';

export function channelBadge(conv: Pick<ConversationSummary, 'platform' | 'kind'>) {
  if (conv.platform === 'test') return { icon: 'flask-outline' as const, color: '#8E33FF' };
  if (conv.kind === 'comment') return { icon: 'facebook' as const, color: FACEBOOK };
  return { icon: 'facebook-messenger' as const, color: MESSENGER };
}

export function InboxAvatar({ conv, size = 52 }: { conv: ConversationSummary; size?: number }) {
  const badge = channelBadge(conv);
  const dot = Math.max(18, Math.round(size * 0.38));
  return (
    <View style={{ width: size, height: size }}>
      <ChatAvatar name={conv.customer.name} avatarUrl={conv.customer.avatarUrl} size={size} />
      <View
        className="absolute items-center justify-center rounded-full border-2 border-surface dark:border-surface-dark"
        style={{ width: dot, height: dot, right: -2, bottom: -2, backgroundColor: badge.color }}
      >
        <Icon name={badge.icon} size={Math.round(dot * 0.6)} color="#FFFFFF" />
      </View>
    </View>
  );
}
