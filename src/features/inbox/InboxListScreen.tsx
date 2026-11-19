import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { AppHeader, EmptyState, ErrorView, Loading, RefreshFlatList } from 'src/components/shared';
import { Chip, CountBadge, Divider, Pressable, Spinner, Text, TextField } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { showActionSheet } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { useScreenActive } from 'src/features/agent-tasks/hooks';
import type { ConversationKind, ConversationListFilter, ConversationStatus, ConversationSummary } from 'src/api/inbox';

import { InboxAvatar } from './InboxAvatar';
import {
  DEFAULT_FILTER,
  KIND_TABS,
  PRIORITY_TAG,
  holderLabel,
  holderTone,
  inboxConversationRoute,
  isHeldByMe,
  isPriority,
  kindUnreadCount,
  lastMessagePreview,
  relativeTime,
} from './inbox-format';
import { useConversationList, useInboxSummary, useRefetchOnReconnect } from './hooks';
import { useInboxHub } from './inbox-hub';

// ----------------------------------------------------------------------
// Hộp thư khách — danh sách (kiểu hộp thư Meta Business Suite trên điện thoại): tab Tất cả / Tin nhắn / Bình luận có số chưa
// đọc, ô tìm, chip lọc nhanh Chưa đọc · Ưu tiên · Chưa ai nhận · AI · Của tôi; dòng có ảnh + dấu kênh, tên đậm khi chưa đọc,
// "Bạn: …", giờ, chip Ưu tiên, người được giao. Kéo làm mới, cuộn tải thêm. Cập nhật trực tiếp qua hub /hubs/inbox.
// ----------------------------------------------------------------------

const STATUS_LABEL: Record<ConversationStatus, string> = { open: 'Đang mở', closed: 'Đã hoàn tất', spam: 'Spam' };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return v;
}

function KindTabs({
  value,
  counts,
  onChange,
}: {
  value: 'all' | ConversationKind;
  counts: Record<'all' | ConversationKind, number>;
  onChange: (k: 'all' | ConversationKind) => void;
}) {
  return (
    <View className="flex-row border-b border-line dark:border-line-dark">
      {KIND_TABS.map((tab) => {
        const active = tab.key === value;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className="flex-1 items-center pt-2"
          >
            <View className="flex-row items-center gap-1.5 pb-2">
              <Text variant="bodySmall" tone={active ? 'primary' : 'muted'} className="font-semibold">
                {tab.label}
              </Text>
              {counts[tab.key] > 0 ? <CountBadge count={counts[tab.key]} /> : null}
            </View>
            <View className={cn('h-0.5 w-full rounded-full', active ? 'bg-primary' : 'bg-transparent')} />
          </Pressable>
        );
      })}
    </View>
  );
}

function ConversationRow({ conv, myUserId, now }: { conv: ConversationSummary; myUserId: string | null; now: number }) {
  const unread = conv.unreadCount > 0;
  const tone = holderTone(conv.holder, myUserId);
  const assigned = conv.assignedName && !isHeldByMe(conv.holder, myUserId) ? conv.assignedName : null;
  return (
    <Pressable
      onPress={() => router.push(inboxConversationRoute(conv.id) as any)}
      accessibilityRole="button"
      accessibilityLabel={`${conv.customer.name}${unread ? `, ${conv.unreadCount} tin chưa đọc` : ''}`}
      className="flex-row items-center gap-3 px-4 py-3"
    >
      <InboxAvatar conv={conv} />
      <View className="flex-1 min-w-0 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text variant="callout" className={cn('flex-1', unread ? 'font-bold' : 'font-medium')} numberOfLines={1}>
            {conv.customer.name}
          </Text>
          <Text variant="caption" tone={unread ? 'primary' : 'faint'} className={unread ? 'font-semibold' : ''}>
            {relativeTime(conv.lastMessageAt, now)}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text
            variant="bodySmall"
            tone={unread ? 'default' : 'muted'}
            className={cn('flex-1', unread && 'font-semibold')}
            numberOfLines={1}
          >
            {lastMessagePreview(conv)}
          </Text>
          {unread ? <CountBadge count={conv.unreadCount} size="md" tone="primary" /> : null}
        </View>
        <View className="flex-row flex-wrap items-center gap-1.5 mt-0.5">
          {isPriority(conv) ? <Chip label="Ưu tiên" icon="star" size="sm" color="warning" /> : null}
          <Chip
            label={holderLabel(conv.holder, myUserId)}
            size="sm"
            color={tone === 'neutral' ? 'default' : tone}
          />
          {assigned ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              Giao: {assigned}
            </Text>
          ) : null}
          {conv.channelName ? (
            <Text variant="caption" tone="faint" numberOfLines={1} className="flex-shrink">
              · {conv.channelName}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function InboxListScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthContext();
  const myUserId = user?.id ?? null;
  const active = useScreenActive();
  useInboxHub(myUserId);

  const [kind, setKind] = useState<'all' | ConversationKind>('all');
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 350);
  const [unread, setUnread] = useState(false);
  const [priority, setPriority] = useState(false);
  const [box, setBox] = useState<ConversationListFilter['box']>('all');
  const [status, setStatus] = useState<ConversationStatus>('open');

  const filter = useMemo<ConversationListFilter>(
    () => ({
      ...DEFAULT_FILTER,
      kind: kind === 'all' ? null : kind,
      q: q.trim(),
      unread,
      tag: priority ? PRIORITY_TAG : null,
      box,
      status,
    }),
    [kind, q, unread, priority, box, status]
  );

  const summary = useInboxSummary(true, active);
  const list = useConversationList(filter, true, active);
  useRefetchOnReconnect(() => {
    list.refetch();
    summary.refetch();
  });

  // Giờ tương đối ở danh sách tự nhảy mỗi phút.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [active]);

  const counts = {
    all: kindUnreadCount(summary.data, 'all'),
    dm: kindUnreadCount(summary.data, 'dm'),
    comment: kindUnreadCount(summary.data, 'comment'),
  };

  const toggleBox = (b: ConversationListFilter['box']) => setBox((cur) => (cur === b ? 'all' : b));

  const pickStatus = () =>
    showActionSheet({
      title: 'Trạng thái hội thoại',
      options: (Object.keys(STATUS_LABEL) as ConversationStatus[]).map((s) => ({
        label: `${STATUS_LABEL[s]}${s === status ? ' ✓' : ''}`,
        onPress: () => setStatus(s),
      })),
    });

  const filtered = unread || priority || box !== 'all' || !!filter.q || status !== 'open';

  const header = (
    <View className="gap-2 pb-1">
      <KindTabs value={kind} counts={counts} onChange={setKind} />
      <View className="px-4 pt-1">
        <TextField
          icon="magnify"
          placeholder="Tìm tên, SĐT, nội dung…"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="px-4 gap-2">
        <Chip label="Chưa đọc" icon="email-mark-as-unread" selected={unread} color="primary" onPress={() => setUnread((v) => !v)} />
        <Chip label="Ưu tiên" icon="star-outline" selected={priority} color="warning" onPress={() => setPriority((v) => !v)} />
        <Chip
          label={summary.data?.unassigned ? `Chưa ai nhận · ${summary.data.unassigned}` : 'Chưa ai nhận'}
          icon="inbox-arrow-down-outline"
          selected={box === 'unassigned'}
          color="error"
          onPress={() => toggleBox('unassigned')}
        />
        <Chip label="AI" icon="robot-outline" selected={box === 'agent'} color="secondary" onPress={() => toggleBox('agent')} />
        <Chip
          label={summary.data?.mine ? `Của tôi · ${summary.data.mine}` : 'Của tôi'}
          icon="account-outline"
          selected={box === 'mine'}
          color="info"
          onPress={() => toggleBox('mine')}
        />
      </ScrollView>
      {status !== 'open' ? (
        <Text variant="caption" tone="muted" className="px-4">
          Đang xem hội thoại: {STATUS_LABEL[status]}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2">
        <AppHeader
          back
          title="Hộp thư khách"
          subtitle="Messenger · bình luận fanpage"
          actions={[{ icon: status === 'open' ? 'filter-outline' : 'filter', onPress: pickStatus }]}
        />
      </View>
      {header}
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorView message="Không tải được hộp thư." onRetry={() => list.refetch()} />
      ) : (
        <RefreshFlatList
          data={list.items}
          keyExtractor={(c) => c.id}
          refreshing={list.isRefetching && !list.isFetchingNextPage}
          onRefresh={() => Promise.all([list.refetch(), summary.refetch()])}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) list.fetchNextPage();
          }}
          onEndReachedThreshold={0.4}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 12 }}
          ItemSeparatorComponent={() => <Divider className="ml-[80px]" />}
          ListFooterComponent={list.isFetchingNextPage ? <View className="py-3"><Spinner /></View> : null}
          ListEmptyComponent={
            <EmptyState
              icon={filtered ? 'filter-remove-outline' : 'message-text-outline'}
              title={filtered ? 'Không có hội thoại khớp bộ lọc' : 'Chưa có hội thoại nào'}
              description={
                filtered
                  ? undefined
                  : 'Tin nhắn Messenger và bình luận trên fanpage của cửa hàng sẽ hiện ở đây.'
              }
            />
          }
          renderItem={({ item }) => <ConversationRow conv={item} myUserId={myUserId} now={now} />}
        />
      )}
    </View>
  );
}
