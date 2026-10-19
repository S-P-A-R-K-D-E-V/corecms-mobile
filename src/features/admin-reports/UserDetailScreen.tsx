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
import { useAuthContext } from 'src/auth/auth-context';
import { getUserRoles } from 'src/auth/roles';
import { PERMISSIONS, hasAllPermissions } from 'src/auth/permissions';
import type { UserStatus } from 'src/types/corecms-api';

import {
  useUser,
  useRoles,
  useCustomRoles,
  useAssignRoles,
  useChangeUserStatus,
  useResetUserFace,
  useSetUserCustomRoles,
  useUserRoleAssignment,
} from './hooks';

// ----------------------------------------------------------------------
// Chi tiết người dùng (Admin): xem hồ sơ, đổi trạng thái (Active/Pending/
// Banned/Rejected), gán vai trò hệ thống (POST roles/assign) và vai trò tuỳ chỉnh của cửa hàng
// (PUT custom-roles/users/{id}). Vai trò ĐƯỢC GÁN đọc từ GET custom-roles/users/{id} — user.roles có cả vai trò gốc
// của vai trò tuỳ chỉnh, tích theo đó là lưu nhầm "Thu ngân" thành Staff hệ thống.
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
  const { user: me } = useAuthContext();
  // Gán vai trò chỉ chủ cửa hàng (Core-be RolesController / custom-roles: Admin) — người khác không tải, không thấy mục này.
  const isOwner = getUserRoles(me).includes('Admin');
  const userQ = useUser(userId);
  const rolesQ = useRoles(isOwner);
  const customRolesQ = useCustomRoles(isOwner);
  const assignmentQ = useUserRoleAssignment(userId, isOwner);
  const statusM = useChangeUserStatus();
  const resetFaceM = useResetUserFace();
  const assignM = useAssignRoles();
  const customM = useSetUserCustomRoles();

  const user = userQ.data;
  // Đổi trạng thái theo quyền user.status; tài khoản Admin chỉ Admin đụng được (Core-be trả 403).
  const targetIsAdmin = [...(user?.roles ?? []), user?.role].includes('Admin');
  const canChangeStatus =
    hasAllPermissions(me, [PERMISSIONS.user.read, PERMISSIONS.user.status]) && (isOwner || !targetIsAdmin);
  // Huỷ khuôn mặt theo quyền user.update; khuôn mặt Admin chỉ Admin huỷ được (Core-be trả 403).
  const canResetFace =
    hasAllPermissions(me, [PERMISSIONS.user.read, PERMISSIONS.user.update]) && (isOwner || !targetIsAdmin);
  // Core-be chặn Admin tự khoá tài khoản / tự gỡ Admin của chính mình (có thể là Admin cuối cùng) — khoá luôn trên UI.
  const isSelf = !!me?.id && me.id === userId;
  const currentStatus: UserStatus = user?.status ?? (user?.isActive ? 'Active' : 'Banned');

  // Vai trò được chọn (roleIds). Khởi tạo từ tên vai trò của user khớp danh mục.
  const [roleIds, setRoleIds] = useState<Set<string> | null>(null);
  // Server chưa có /custom-roles (bản cũ) → đọc vai trò như trước từ user.roles, không có vai trò tuỳ chỉnh.
  const assignment = useMemo(() => {
    if (assignmentQ.data) return assignmentQ.data;
    if (assignmentQ.isError && user) {
      return { systemRoles: [...(user.roles ?? []), user.role].filter(Boolean) as string[], customRoleIds: [] };
    }
    return undefined;
  }, [assignmentQ.data, assignmentQ.isError, user]);

  const initialRoleIds = useMemo(() => {
    if (!assignment || !rolesQ.data) return null;
    const names = new Set(assignment.systemRoles);
    return new Set(rolesQ.data.filter((r) => names.has(r.name)).map((r) => r.id));
  }, [assignment, rolesQ.data]);
  const initialCustomIds = useMemo(() => (assignment ? new Set(assignment.customRoleIds) : null), [assignment]);
  const [customIds, setCustomIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (initialRoleIds && roleIds === null) setRoleIds(new Set(initialRoleIds));
  }, [initialRoleIds, roleIds]);
  useEffect(() => {
    if (initialCustomIds && customIds === null) setCustomIds(new Set(initialCustomIds));
  }, [initialCustomIds, customIds]);

  const systemDirty = useMemo(() => differs(roleIds, initialRoleIds), [roleIds, initialRoleIds]);
  const customDirty = useMemo(() => differs(customIds, initialCustomIds), [customIds, initialCustomIds]);
  const rolesDirty = systemDirty || customDirty;

  function toggleIn(setter: typeof setRoleIds, id: string) {
    haptics.selection();
    setter((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const toggleRole = (id: string) => toggleIn(setRoleIds, id);
  const toggleCustom = (id: string) => toggleIn(setCustomIds, id);

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

  async function resetFace() {
    if (!userId) return;
    const ok = await confirm({
      title: 'Huỷ khuôn mặt',
      message: `Xoá khuôn mặt chấm công đã đăng ký của "${user?.fullName}"? Nhân viên sẽ được báo đăng ký lại; cửa hàng bật "Bắt buộc khuôn mặt" thì họ không chấm công được cho tới khi đăng ký lại.`,
      confirmText: 'Huỷ khuôn mặt',
      destructive: true,
    });
    if (!ok) return;
    try {
      await resetFaceM.mutateAsync(userId);
      haptics.success();
      toast.success('Nhân viên sẽ được báo đăng ký lại.', 'Đã huỷ khuôn mặt');
    } catch (e) {
      haptics.error();
      toast.error(extractApiError(e), 'Không huỷ được');
    }
  }

  async function saveRoles() {
    if (!userId || !roleIds || !customIds) return;
    const ok = await confirm({
      title: 'Cập nhật vai trò',
      message: `Lưu ${roleIds.size + customIds.size} vai trò cho "${user?.fullName}"?`,
      confirmText: 'Lưu',
    });
    if (!ok) return;
    try {
      // Phần nào không đổi thì không gửi — mỗi lệnh có thể buộc người đó đăng nhập lại.
      if (systemDirty) await assignM.mutateAsync({ userId, roleIds: [...roleIds] });
      if (customDirty) await customM.mutateAsync({ userId, customRoleIds: [...customIds] });
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
                const locked = !canChangeStatus || (isSelf && s.key !== 'Active');
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => changeStatus(s.key)}
                    disabled={statusM.isPending || locked}
                    className={cn('px-3.5 py-2 rounded-full border', active ? 'bg-primary border-primary' : 'bg-surface dark:bg-surface-dark border-line/60 dark:border-line-dark')}
                  >
                    <Text variant="bodySmall" className={cn('font-semibold', active ? 'text-white' : 'text-muted')}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {isSelf ? (
              <Text variant="caption" tone="muted" className="mt-2">
                Không tự khoá tài khoản của chính mình — nhờ một Admin khác nếu cần.
              </Text>
            ) : null}
          </Card>

          {/* Khuôn mặt chấm công */}
          <Card className="p-4">
            <View className="flex-row items-center gap-2">
              <Icon name="face-recognition" size={18} tone="primary" />
              <Text variant="subtitle" className="flex-1">Khuôn mặt chấm công</Text>
              <Badge tone={user.hasFaceEmbedding ? 'success' : 'warning'}>
                {user.hasFaceEmbedding ? 'Đã đăng ký' : 'Chưa đăng ký'}
              </Badge>
            </View>
            {user.hasFaceEmbedding && canResetFace ? (
              <>
                <Text variant="caption" tone="muted" className="mt-2">
                  Đăng ký nhầm người, ảnh mờ hay khuôn mặt đã thay đổi — huỷ để nhân viên đăng ký lại.
                </Text>
                <Button
                  variant="outline"
                  action="error"
                  className="mt-3"
                  icon="face-recognition"
                  loading={resetFaceM.isPending}
                  onPress={resetFace}
                >
                  Huỷ khuôn mặt
                </Button>
              </>
            ) : null}
          </Card>

          {/* Vai trò — chỉ chủ cửa hàng */}
          {isOwner ? (
          <Card className="p-4">
            <View className="flex-row items-center gap-2 mb-2">
              <Icon name="shield-account-outline" size={18} tone="primary" />
              <Text variant="subtitle" className="flex-1">Vai trò</Text>
              {rolesDirty ? <Badge tone="warning">Chưa lưu</Badge> : null}
            </View>
            {rolesQ.isLoading || assignmentQ.isLoading ? (
              <Skeleton width="100%" height={80} radius={12} />
            ) : rolesQ.isError ? (
              <ErrorView onRetry={rolesQ.refetch} />
            ) : (
              <>
                {(rolesQ.data ?? []).map((r, i) => {
                  const on = roleIds?.has(r.id) ?? false;
                  const locked = isSelf && r.name === 'Admin' && on;
                  return (
                    <View key={r.id}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable onPress={() => toggleRole(r.id)} disabled={locked} className="flex-row items-center gap-3 py-2.5">
                        <View className="flex-1">
                          <Text variant="bodySmall" className="font-medium">{r.name}</Text>
                          {locked ? (
                            <Text variant="caption" tone="muted" numberOfLines={1}>Không tự gỡ vai trò Admin của chính mình</Text>
                          ) : r.description ? (
                            <Text variant="caption" tone="muted" numberOfLines={1}>{r.description}</Text>
                          ) : null}
                        </View>
                        <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} tone={on ? 'primary' : 'faint'} />
                      </Pressable>
                    </View>
                  );
                })}
                {!assignmentQ.isError && (customRolesQ.data ?? []).length > 0 ? (
                  <>
                    <Text variant="caption" tone="muted" className="mt-3 mb-1">Vai trò tuỳ chỉnh của cửa hàng</Text>
                    {(customRolesQ.data ?? []).map((r, i) => {
                      const on = customIds?.has(r.id) ?? false;
                      return (
                        <View key={r.id}>
                          {i > 0 ? <Divider /> : null}
                          <Pressable onPress={() => toggleCustom(r.id)} className="flex-row items-center gap-3 py-2.5">
                            <View className="flex-1">
                              <Text variant="bodySmall" className="font-medium">{r.name}</Text>
                              <Text variant="caption" tone="muted" numberOfLines={1}>
                                Gốc {r.baseRole} · {r.permissions.length} quyền
                              </Text>
                            </View>
                            <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} tone={on ? 'primary' : 'faint'} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </>
                ) : null}
                <Button fullWidth className="mt-2" disabled={!rolesDirty} loading={assignM.isPending || customM.isPending} onPress={saveRoles} icon="content-save-outline">
                  Lưu vai trò
                </Button>
              </>
            )}
          </Card>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function differs(current: Set<string> | null, initial: Set<string> | null): boolean {
  if (!current || !initial) return false;
  if (current.size !== initial.size) return true;
  for (const id of current) if (!initial.has(id)) return true;
  return false;
}
