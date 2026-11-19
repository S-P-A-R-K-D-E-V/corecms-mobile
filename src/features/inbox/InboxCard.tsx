import { View } from 'react-native';
import { router } from 'expo-router';

import { CountBadge, Icon, Pressable, Text } from 'src/components/ui';
import { useAuthContext } from 'src/auth/auth-context';
import { hasPermission, PERMISSIONS } from 'src/auth/permissions';
import { useScreenActive } from 'src/features/agent-tasks/hooks';
import { SOCIAL_SELLING_FEATURE, hasStoreFeature } from 'src/features/launcher/registry';
import { useFeatureContext } from 'src/features/launcher/feature-context';

import { INBOX_ROUTE, inboxAttentionCount } from './inbox-format';
import { useInboxHomeSummary } from './hooks';

// ----------------------------------------------------------------------
// Thẻ "Hộp thư khách" ở trang chủ / dashboard: người có conversation.read, cửa hàng bật bán online, chỉ khi có hội thoại chưa
// ai nhận hoặc chưa đọc (như chấm đỏ menu web). Làm mới mỗi phút khi màn đang hiện; API lỗi → ẩn. Bấm → Hộp thư khách.
// ----------------------------------------------------------------------

export function InboxCard() {
  const { user } = useAuthContext();
  const ctx = useFeatureContext();
  const allowed = hasPermission(user, PERMISSIONS.conversation.read) && hasStoreFeature(ctx, SOCIAL_SELLING_FEATURE) && !ctx.counter;
  const active = useScreenActive();
  const { data } = useInboxHomeSummary(allowed, active);
  const count = inboxAttentionCount(data);
  if (!allowed || !data || count <= 0) return null;

  const parts = [
    data.unassigned > 0 ? `${data.unassigned} chưa ai nhận` : null,
    data.unread > 0 ? `${data.unread} chưa đọc` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => router.push(INBOX_ROUTE as any)}
      accessibilityRole="button"
      accessibilityLabel={`Hộp thư khách: ${parts.join(', ')}`}
      className="flex-row items-center gap-3 rounded-2xl border border-info/30 bg-info-soft px-4 py-3"
    >
      <View className="w-10 h-10 rounded-xl items-center justify-center bg-surface dark:bg-surface-dark">
        <Icon name="facebook-messenger" size={22} tone="info" />
      </View>
      <View className="flex-1">
        <Text variant="bodySmall" className="font-semibold">Hộp thư khách</Text>
        <Text variant="caption" tone="muted">{parts.join(' · ')}</Text>
      </View>
      <CountBadge count={count} size="md" />
      <Icon name="chevron-right" size={20} tone="muted" />
    </Pressable>
  );
}
