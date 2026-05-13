import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { Text, Avatar, Badge, Divider, Searchbar, useTheme, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs from 'dayjs';

import { fetchConversations, fetchUsers } from 'src/api/messenger';
import { useMessengerStore } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';
import type { ConversationSummary } from 'src/api/messenger';

// ----------------------------------------------------------------------

function formatTime(iso: string | null) {
  if (!iso) return '';
  const d = dayjs(iso);
  if (d.isToday()) return d.format('HH:mm');
  if (d.isYesterday()) return 'Hôm qua';
  return d.format('DD/MM');
}

function ConversationItem({ conv, onPress }: { conv: ConversationSummary; onPress: () => void }) {
  const theme = useTheme();
  const { userCache } = useMessengerStore();
  const { user } = useAuthContext();

  const otherUserId = conv.participantIds.find((id) => id !== user?.id) ?? '';
  const otherUser = userCache[otherUserId];
  const name = conv.type === 'Group'
    ? (conv.name ?? 'Nhóm chat')
    : (otherUser?.fullName ?? 'Người dùng');
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const isOnline = otherUser?.online ?? false;

  return (
    <TouchableOpacity onPress={onPress} style={styles.convItem} activeOpacity={0.7}>
      <View style={styles.avatarWrap}>
        <Avatar.Text size={48} label={initials} style={{ backgroundColor: theme.colors.primaryContainer }} />
        {conv.type === 'Private' && isOnline && (
          <View style={[styles.onlineDot, { backgroundColor: '#00A76F', borderColor: theme.colors.surface }]} />
        )}
      </View>
      <View style={styles.convInfo}>
        <View style={styles.convHeader}>
          <Text variant="titleSmall" style={{ fontWeight: conv.unreadCount > 0 ? 'bold' : '600', flex: 1 }} numberOfLines={1}>
            {name}
          </Text>
          <Text variant="bodySmall" style={{ color: '#637381', fontSize: 11 }}>
            {formatTime(conv.lastMessageAt)}
          </Text>
        </View>
        <View style={styles.convPreview}>
          <Text
            variant="bodySmall"
            style={{ color: conv.unreadCount > 0 ? theme.colors.onSurface : '#637381', flex: 1, fontWeight: conv.unreadCount > 0 ? '500' : '400' }}
            numberOfLines={1}
          >
            {conv.lastMessagePreview ?? 'Chưa có tin nhắn'}
          </Text>
          {conv.unreadCount > 0 && (
            <Badge style={{ backgroundColor: theme.colors.primary }}>{conv.unreadCount}</Badge>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ----------------------------------------------------------------------

export default function ChatListScreen() {
  const theme = useTheme();
  const { conversations, setConversations, setUserCache } = useMessengerStore();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [convs, users] = await Promise.all([fetchConversations(), fetchUsers()]);
      setConversations(convs);
      setUserCache(users);
    } catch {
    } finally {
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
        (c.lastMessagePreview ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : conversations;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Searchbar
        placeholder="Tìm kiếm cuộc trò chuyện..."
        value={search}
        onChangeText={setSearch}
        style={[styles.search, { backgroundColor: theme.colors.surface }]}
        inputStyle={{ fontSize: 14 }}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
        ItemSeparatorComponent={() => <Divider style={{ marginLeft: 76 }} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 40 }}>💬</Text>
            <Text variant="bodyMedium" style={{ color: '#637381', marginTop: 8 }}>
              {search ? 'Không tìm thấy cuộc trò chuyện' : 'Chưa có tin nhắn nào'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ConversationItem
            conv={item}
            onPress={() => router.push({ pathname: '/(tabs)/chat/[id]', params: { id: item.id, name: item.name ?? '' } })}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: { margin: 12, borderRadius: 12, elevation: 0 },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  avatarWrap: { position: 'relative' },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 2,
  },
  convInfo: { flex: 1, gap: 3 },
  convHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  convPreview: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
});
