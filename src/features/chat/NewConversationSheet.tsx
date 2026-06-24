import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Text, TextField, Pressable, Spinner } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { fetchUsers, openPrivateConversation, type InternalUser } from 'src/api/messenger';
import { useMessengerStore } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpened: (conversationId: string, name: string) => void;
};

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

export function NewConversationSheet({ visible, onClose, onOpened }: Props) {
  const { user } = useAuthContext();
  const { userCache, setUserCache } = useMessengerStore();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // Làm mới danh bạ mỗi lần mở (trạng thái online cập nhật realtime qua provider)
  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setRefreshing(true);
    fetchUsers()
      .then(setUserCache)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [visible, setUserCache]);

  const users = useMemo(() => {
    const all = Object.values(userCache).filter((u) => u.id !== user?.id);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? all.filter((u) => u.fullName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      : all;
    return filtered.sort((a, b) => Number(b.online) - Number(a.online) || a.fullName.localeCompare(b.fullName));
  }, [userCache, user?.id, search]);

  async function handlePick(target: InternalUser) {
    if (openingId) return;
    setOpeningId(target.id);
    try {
      const conv = await openPrivateConversation(target.id);
      onOpened(conv.id, target.fullName);
    } catch {
      setOpeningId(null);
    }
  }

  return (
    <Sheet visible={visible} title="Tin nhắn mới" onClose={onClose}>
      <TextField
        icon="magnify"
        placeholder="Tìm nhân viên theo tên hoặc email…"
        value={search}
        onChangeText={setSearch}
        containerClassName="mb-2"
      />
      {refreshing && users.length === 0 ? (
        <View className="py-8 items-center"><Spinner /></View>
      ) : users.length === 0 ? (
        <Text tone="muted" className="text-center py-8">Không tìm thấy nhân viên phù hợp</Text>
      ) : (
        users.map((u) => (
          <Pressable
            key={u.id}
            onPress={() => handlePick(u)}
            className="flex-row items-center gap-3 py-2.5"
          >
            <View className="relative">
              <View className="w-11 h-11 rounded-full bg-primary-50 items-center justify-center">
                <Text className="text-primary font-bold">{initialsOf(u.fullName)}</Text>
              </View>
              {u.online ? (
                <View className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-primary border-2 border-surface dark:border-surface-dark" />
              ) : null}
            </View>
            <View className="flex-1">
              <Text variant="subtitle" numberOfLines={1}>{u.fullName}</Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>{u.email}</Text>
            </View>
            {openingId === u.id ? <Spinner /> : (
              <Text variant="caption" className={cn('font-semibold', u.online ? 'text-primary' : 'text-faint')}>
                {u.online ? 'Online' : ''}
              </Text>
            )}
          </Pressable>
        ))
      )}
    </Sheet>
  );
}
