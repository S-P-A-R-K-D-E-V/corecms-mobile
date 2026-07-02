import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import dayjs from 'dayjs';

import { Screen, AppHeader, ErrorView } from 'src/components/shared';
import { Card, Text, Badge, Button, Icon, Pressable, Skeleton, Divider, Avatar } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { toast, confirm } from 'src/components/overlay';
import { haptics } from 'src/services/haptics';
import { extractApiError } from 'src/services/error';
import { getStorageUrl } from 'src/api/axios';
import type { UserStatus } from 'src/types/corecms-api';

import { useUser, useRoles, useChangeUserStatus, useAssignRoles } from './hooks';

// ----------------------------------------------------------------------
// Chi tiết người dùng (Admin): xem hồ sơ, đổi trạng thái (Active/Pending/
// Banned/Rejected), gán vai trò (đổi loại quyền). Ghi qua PATCH status &
// POST roles/assign.
// ----------------------------------------------------------------------

const STATUSES: { key: UserStatus; label: string; tone: 'success' | 'warning' | 'error' | 'info' }[] = [
  { key: 'Active', label: 'Hoạt động', tone: 'success' },
  { key: 'Pending', label: 'Chờ duyệt', tone: 'warning' },
  { key: 'Banned', label: 'Cấm', tone: 'error' },
  { key: 'Rejected', label: 'Từ chối', tone: 'info' },
];

export function UserDetailScreen() {
  const params = useLocalSearchParams<{ userId: string; name?: string }>();
  const userId = params.userId;
  const userQ = useUser(userId);
  const rolesQ = useRoles();
  const statusM = useChangeUserStatus();
  const assignM = useAssignRoles();

  const user = userQ.data;
  const currentStatus: UserStatus = user?.status ?? (user?.isActive ? 'Active' : 'Banned');

  // Vai trò được chọn (roleIds). Khởi tạo từ tên vai trò của user khớp danh mục.
  const [roleIds, setRoleIds] = useState<Set<string> | null>(null);
  const initialRoleIds = useMemo(() => {
    if (!user || !rolesQ.data) return null;
    const names = new Set([...(user.roles ?? []), user.role].filter(Boolean));
    return new Set(rolesQ.data.filter((r) => names.has(r.name)).map((r) => r.id));
  }, [user, rolesQ.data]);

  useEffect(() => {
    if (initialRoleIds && roleIds === null) setRoleIds(new Set(initialRoleIds));
  }, [initialRoleIds, roleIds]);

  const rolesDirty = useMemo(() => {
    if (!roleIds || !initialRoleIds) return false;
    if (roleIds.size !== initialRoleIds.size) return true;
    for (const id of roleIds) if (!initialRoleIds.has(id)) return true;
    return false;
  }, [roleIds, initialRoleIds]);

  function toggleRole(id: string) {
    haptics.selection();
    setRoleIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function changeStatus(next: UserStatus) {
    if (!userId || next === currentStatus) return;
    const meta = STATUSES.find((s) => s.key === next)!;
    const ok = await confirm({
      title: 'Đổi trạng thái',
      message: `Đặt tài khoản "${user?.fullName}" sang "${meta.label}"?`,
      confirmText: 'Xác nhận',
      destructive: next === 'Banned' || next === 'Rejected',
    });
    if (!ok) return;
    try {
      await statusM.mutateAsync({ id: userId, data: { status: next } });
      haptics.success();
      toast.success(`Đã chuyển sang "${meta.label}".`, 'Cập nhật trạng thái');
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không đổi được');
    }
  }

  async function saveRoles() {
    if (!userId || !roleIds) return;
    const ok = await confirm({
      title: 'Cập nhật vai trò',
      message: `Lưu ${roleIds.size} vai trò cho "${user?.fullName}"?`,
      confirmText: 'Lưu',
    });
    if (!ok) return;
    try {
      await assignM.mutateAsync({ userId, roleIds: [...roleIds] });
      haptics.success();
      toast.success('Đã cập nhật vai trò.', 'Phân quyền');
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không lưu được');
    }
  }

  return (
    <Screen scroll tabBarInset={false} refreshing={userQ.isFetching} onRefresh={userQ.refetch}>
      <AppHeader title={user?.fullName ?? params.name ?? 'Người dùng'} subtitle="Chi tiết & phân quyền" back />

      {userQ.isLoading ? (
        <View className="gap-3"><Skeleton width="100%" height={120} radius={16} /><Skeleton width="100%" height={160} radius={16} /></View>
      ) : userQ.isError || !user ? (
        <ErrorView onRetry={userQ.refetch} />
      ) : (
        <>
          {/* Hồ sơ */}
          <Card className="p-4 flex-row items-center gap-3">
            <Avatar name={user.fullName} uri={getStorageUrl(user.avatarUrl || user.profileImageUrl) || null} size={56} />
            <View className="flex-1">
              <Text variant="title" numberOfLines={1}>{user.fullName}</Text>
              <Text variant="bodySmall" tone="muted" numberOfLines={1}>{user.email}</Text>
              {user.phoneNumber ? <Text variant="caption" tone="muted">{user.phoneNumber}</Text> : null}
              <Text variant="caption" tone="faint">Tạo {dayjs(user.createdAt).format('DD/MM/YYYY')}</Text>
            </View>
            <Badge tone={STATUSES.find((s) => s.key === currentStatus)?.tone ?? 'info'}>
              {STATUSES.find((s) => s.key === currentStatus)?.label ?? currentStatus}
            </Badge>
          </Card>

          {/* Trạng thái */}
          <Card className="p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon name="account-cog-outline" size={18} tone="primary" />
              <Text variant="subtitle">Trạng thái tài khoản</Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {STATUSES.map((s) => {
                const active = s.key === currentStatus;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => changeStatus(s.key)}
                    disabled={statusM.isPending}
                    className={cn('px-3.5 py-2 rounded-full border', active ? 'bg-primary border-primary' : 'bg-surface dark:bg-surface-dark border-line/60 dark:border-line-dark')}
                  >
                    <Text variant="bodySmall" className={cn('font-semibold', active ? 'text-white' : 'text-muted')}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          {/* Vai trò */}
          <Card className="p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon name="shield-account-outline" size={18} tone="primary" />
              <Text variant="subtitle" className="flex-1">Vai trò</Text>
              {rolesDirty ? <Badge tone="warning">Chưa lưu</Badge> : null}
            </View>
            {rolesQ.isLoading ? (
              <Skeleton width="100%" height={80} radius={12} />
            ) : rolesQ.isError ? (
              <ErrorView onRetry={rolesQ.refetch} />
            ) : (
              <>
                {(rolesQ.data ?? []).map((r, i) => {
                  const on = roleIds?.has(r.id) ?? false;
                  return (
                    <View key={r.id}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable onPress={() => toggleRole(r.id)} className="flex-row items-center gap-3 py-2.5">
                        <View className="flex-1">
                          <Text variant="bodySmall" className="font-medium">{r.name}</Text>
                          {r.description ? <Text variant="caption" tone="muted" numberOfLines={1}>{r.description}</Text> : null}
                        </View>
                        <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} tone={on ? 'primary' : 'faint'} />
                      </Pressable>
                    </View>
                  );
                })}
                <Button fullWidth className="mt-2" disabled={!rolesDirty} loading={assignM.isPending} onPress={saveRoles} icon="content-save-outline">
                  Lưu vai trò
                </Button>
              </>
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
