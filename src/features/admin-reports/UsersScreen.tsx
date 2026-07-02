import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen, AppHeader, EmptyState, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Icon, Skeleton, Divider, Avatar, TextField } from 'src/components/ui';
import { getStorageUrl } from 'src/api/axios';
import type { IUser } from 'src/types/corecms-api';

import { useUsers } from './hooks';

// ----------------------------------------------------------------------
// Danh sách người dùng (Admin): avatar + vai trò + trạng thái hoạt động,
// có ô tìm kiếm theo tên/email/điện thoại. Chỉ xem (chỉnh sửa để Phase sau).
// ----------------------------------------------------------------------

const ROLE_TONE: Record<string, 'primary' | 'info' | 'success' | 'warning' | 'error'> = {
  Admin: 'error',
  Manager: 'warning',
  Staff: 'info',
  User: 'primary',
};

function rolesOf(u: IUser): string[] {
  const set = new Set<string>(u.roles ?? []);
  if (u.role) set.add(u.role);
  return [...set];
}

function UserRow({ u }: { u: IUser }) {
  return (
    <View className="flex-row items-center gap-3 py-2.5">
      <Avatar name={u.fullName} uri={getStorageUrl(u.avatarUrl || u.profileImageUrl) || null} size={40} />
      <View className="flex-1">
        <View className="flex-row items-center gap-2">
          <Text variant="bodySmall" className="font-semibold flex-shrink" numberOfLines={1}>{u.fullName}</Text>
          {!u.isActive ? <Badge tone="error">Ngừng</Badge> : null}
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>{u.email}{u.phoneNumber ? ` · ${u.phoneNumber}` : ''}</Text>
        <View className="flex-row flex-wrap gap-1 mt-1">
          {rolesOf(u).map((r) => (
            <Badge key={r} tone={ROLE_TONE[r] ?? 'primary'}>{r}</Badge>
          ))}
        </View>
      </View>
    </View>
  );
}

export function UsersScreen() {
  const { data, isLoading, isError, refetch, isFetching } = useUsers();
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const list = data ?? [];
    const kw = q.trim().toLowerCase();
    const matched = kw
      ? list.filter((u) =>
          [u.fullName, u.email, u.phoneNumber].filter(Boolean).some((s) => s!.toLowerCase().includes(kw))
        )
      : list;
    // Đang hoạt động trước, rồi theo tên.
    return [...matched].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.fullName.localeCompare(b.fullName));
  }, [data, q]);

  const activeCount = (data ?? []).filter((u) => u.isActive).length;

  return (
    <Screen scroll tabBarInset={false} refreshing={isFetching} onRefresh={refetch}>
      <AppHeader title="Người dùng" subtitle={data ? `${activeCount}/${data.length} đang hoạt động` : 'Danh sách tài khoản'} back />

      <TextField icon="magnify" value={q} onChangeText={setQ} placeholder="Tìm theo tên, email, SĐT…" />

      {isLoading ? (
        <Card className="p-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="flex-row items-center gap-3">
              <Skeleton width={40} height={40} radius={20} />
              <View className="flex-1 gap-1">
                <Skeleton width="55%" height={14} />
                <Skeleton width="75%" height={11} />
              </View>
            </View>
          ))}
        </Card>
      ) : isError ? (
        <ErrorView onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <EmptyState icon="account-search-outline" title="Không tìm thấy" description="Không có người dùng khớp từ khoá." />
      ) : (
        <Card className="p-4">
          {filtered.map((u, i) => (
            <View key={u.id}>
              {i > 0 ? <Divider /> : null}
              <UserRow u={u} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
