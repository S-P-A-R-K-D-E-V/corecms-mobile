import { useCallback, useEffect, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

import { AppHeader, EmptyState, Loading } from 'src/components/shared';
import { Text, TextField, Divider, Pressable } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { fetchConversations, fetchUsers, type ConversationSummary } from 'src/api/messenger';
import { useMessengerStore } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = dayjs(iso);
  if (d.isToday()) return d.format('HH:mm');
  if (d.isYesterday()) return 'Hôm qua';
  return d.format('DD/MM');
}

function ConversationRow({ conv }: { conv: ConversationSummary }) {
  const { userCache } = useMessengerStore();
  const { user } = useAuthContext();
  const otherId = conv.participantIds.find((id) => id !== user?.id) ?? '';
  const other = userCache[otherId];
  const name = conv.type === 'Group' ? conv.name ?? 'Nhóm chat' : other?.fullName ?? 'Người dùng';
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const online = other?.online ?? false;
  const unread = conv.unreadCount > 0;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/(tabs)/chat/[id]', params: { id: conv.id, name } })}
      className="flex-row items-center gap-3 px-4 py-3"
    >
      <View className="relative">
        <View className="w-12 h-12 rounded-full bg-primary-50 items-center justify-center">
          <Text className="text-primary font-bold">{initials}</Text>
        </View>
        {conv.type === 'Private' && online ? (
          <View className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-primary border-2 border-surface dark:border-surface-dark" />
        ) : null}
      </View>
      <View className="flex-1 gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text variant="subtitle" className={cn('flex-1', !unread && 'font-semibold')} numberOfLines={1}>{name}</Text>
          <Text variant="caption" tone="faint">{formatTime(conv.lastMessageAt)}</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Text variant="bodySmall" tone={unread ? 'default' : 'muted'} className={cn('flex-1', unread && 'font-medium')} numberOfLines={1}>
            {conv.lastMessagePreview ?? 'Chưa có tin nhắn'}
          </Text>
          {unread ? (
            <View className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary items-center justify-center">
              <Text className="text-white text-[10px] font-bold">{conv.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

export function ChatListScreen() {
  const insets = useSafeAreaInsets();
  const { conversations, setConversations, setUserCache } = useMessengerStore();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [convs, users] = await Promise.all([fetchConversations(), fetchUsers()]);
      setConversations(convs);
      setUserCache(users);
    } catch {} finally {
      setLoading(false);
    }
  }, [setConversations, setUserCache]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = search
    ? conversations.filter((c) =>
        (c.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (c.lastMessagePreview ?? '').toLowerCase().includes(search.toLowerCase()))
    : conversations;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2">
        <AppHeader title="Tin nhắn" />
        <TextField icon="magnify" placeholder="Tìm cuộc trò chuyện..." value={search} onChangeText={setSearch} containerClassName="mb-2" />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerClassName="pb-4"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brand.primary]} tintColor={brand.primary} />}
          ItemSeparatorComponent={() => <Divider className="ml-[72px]" />}
          ListEmptyComponent={<EmptyState icon="message-outline" title={search ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có tin nhắn nào'} />}
          renderItem={({ item }) => <ConversationRow conv={item} />}
        />
      )}
    </View>
  );
}
