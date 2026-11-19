import { useEffect, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { AppHeader, EmptyState, Screen, Sheet } from 'src/components/shared';
import { Button, Chip, Icon, Pressable, Spinner, Text, TextField } from 'src/components/ui';
import { toast } from 'src/components/overlay';
import { addGroupMembers, fetchUsers, removeGroupMember, type Conversation } from 'src/api/messenger';
import { getAgentAdminGroup } from 'src/api/agent-center';
import { useMessengerStore } from 'src/store/messenger-store';
import { useAuthContext } from 'src/auth/auth-context';
import { PERMISSIONS, hasPermission } from 'src/auth/permissions';
import { haptics } from 'src/services/haptics';
import { t } from 'src/i18n';

import { ChatAvatar } from './ChatAvatar';
import {
  addableUsers,
  agentAccessOf,
  agentMemberChip,
  canAddMembers,
  canLeaveGroup,
  canRemoveMember,
  memberErrorMessage,
  memberName,
  peopleCount,
  sortMemberIds,
} from './group-members';
import { isAgentAdminConversation, isSystemUserId, systemConversationIcon, systemConversationName } from './messenger-system';

// ----------------------------------------------------------------------
// Màn "Thành viên" của nhóm Messenger (A4 — bản app của ngăn Thành viên trên web): danh sách, thêm người, gỡ người, rời nhóm.
// Luật ẩn / hiện nút ở group-members.ts (khớp core-be); máy chủ vẫn quyết định — lỗi trả về luôn hiện trên màn.
// ----------------------------------------------------------------------

export const AGENT_ADMIN_GROUP_KEY = ['agent-center', 'admin-group'] as const;

export function GroupMembersScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuthContext();
  const currentUserId: string | null = user?.id ?? null;

  const conv = useMessengerStore((s) => s.conversations.find((c) => c.id === conversationId));
  const userCache = useMessengerStore((s) => s.userCache);

  const agentAdmin = isAgentAdminConversation(conv);
  const canManageAgents = hasPermission(user, PERMISSIONS.agent.manage);
  const selfCanApprove = canManageAgents || hasPermission(user, PERMISSIONS.agent.approve);
  const actor = { currentUserId, canManageAgents };

  // Ai giao việc được cho CEO: máy chủ trả sẵn approverIds (API cần agent.approve — người chỉ xem chỉ thấy nhãn của mình).
  const adminGroup = useQuery({
    queryKey: AGENT_ADMIN_GROUP_KEY,
    queryFn: getAgentAdminGroup,
    enabled: agentAdmin && selfCanApprove,
    staleTime: 30_000,
    retry: false,
  });
  const approverIds = adminGroup.data?.approverIds ?? null;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const memberIds = useMemo(
    () => (conv ? sortMemberIds(conv.participantIds, currentUserId, userCache) : []),
    [conv, currentUserId, userCache]
  );

  if (!conv) {
    return (
      <Screen tabBarInset={false}>
        <AppHeader title={t('chat.members.title')} back />
        <EmptyState icon="account-group-outline" title={t('chat.members.notFound')} />
      </Screen>
    );
  }

  const groupName = conv.name || systemConversationName(conv.systemKey) || t('chat.members.title');

  const applyConversation = (updated: Conversation | null | undefined) => {
    if (!updated || !Array.isArray(updated.participantIds)) return;
    useMessengerStore.getState().updateConversation({
      id: conv.id,
      participantIds: updated.participantIds,
      ...(updated.createdById ? { createdById: updated.createdById } : {}),
    });
  };

  const handleAdd = async (ids: string[]) => {
    if (ids.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      applyConversation(await addGroupMembers(conv.id, ids));
      haptics.success();
      toast.success(t('chat.members.added'));
      setPickerOpen(false);
      if (agentAdmin) adminGroup.refetch();
    } catch (err) {
      setError(memberErrorMessage(err, t('chat.members.addFailed')));
      setPickerOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (memberId: string) => {
    setBusy(true);
    setError(null);
    try {
      applyConversation(await removeGroupMember(conv.id, memberId));
      if (agentAdmin) adminGroup.refetch();
    } catch (err) {
      setError(memberErrorMessage(err, t('chat.members.removeFailed')));
    } finally {
      setBusy(false);
    }
  };

  const doLeave = async () => {
    if (!currentUserId) return;
    setBusy(true);
    setError(null);
    try {
      await removeGroupMember(conv.id, currentUserId);
      // Về danh sách trước rồi mới bỏ hội thoại khỏi store — tránh màn này / màn chat chớp "không tìm thấy nhóm".
      router.dismissTo('/(tabs)/chat' as any);
      const s = useMessengerStore.getState();
      s.setConversations(s.conversations.filter((c) => c.id !== conv.id));
    } catch (err) {
      setError(memberErrorMessage(err, t('chat.members.leaveFailed')));
      setBusy(false);
    }
  };

  const confirmRemove = (memberId: string) => {
    if (busy) return;
    Alert.alert(t('chat.members.removeTitle'), t('chat.members.removeMessage', { name: memberName(memberId, userCache) }), [
      { text: t('chat.members.cancel'), style: 'cancel' },
      { text: t('chat.members.remove'), style: 'destructive', onPress: () => doRemove(memberId) },
    ]);
  };

  const confirmLeave = () => {
    if (busy) return;
    Alert.alert(
      t('chat.members.leaveTitle'),
      agentAdmin && !canManageAgents ? t('chat.members.leaveMessageAgentAdmin') : t('chat.members.leaveMessage'),
      [
        { text: t('chat.members.cancel'), style: 'cancel' },
        { text: t('chat.members.leave'), style: 'destructive', onPress: doLeave },
      ]
    );
  };

  const showAdd = canAddMembers(conv, actor);

  return (
    <Screen scroll tabBarInset={false}>
      <AppHeader
        title={t('chat.members.titleCount', { n: peopleCount(conv.participantIds, userCache) })}
        subtitle={groupName}
        back
      />

      {error ? (
        <Pressable
          onPress={() => setError(null)}
          className="flex-row items-start gap-2 p-3 mb-3 rounded-xl bg-error-soft"
        >
          <Icon name="alert-circle-outline" size={20} tone="error" />
          <Text variant="bodySmall" tone="error" className="flex-1">{error}</Text>
          <Icon name="close" size={18} tone="error" />
        </Pressable>
      ) : null}

      {agentAdmin ? (
        <View className="flex-row items-start gap-2 p-3 mb-3 rounded-xl border border-line dark:border-line-dark">
          <Icon name="information-outline" size={20} tone="info" />
          <Text variant="bodySmall" tone="muted" className="flex-1">
            {t('chat.members.agentNote')}
            {!canManageAgents ? ` ${t('chat.members.agentManageNote')}` : ''}
          </Text>
        </View>
      ) : null}

      {showAdd ? (
        <Button
          variant="soft"
          icon="account-plus-outline"
          onPress={() => setPickerOpen(true)}
          disabled={busy}
          fullWidth
          className="mb-3"
        >
          {t('chat.members.add')}
        </Button>
      ) : null}

      <View className="gap-1">
        {memberIds.map((id) => {
          const isSystem = isSystemUserId(id) || !!userCache[id]?.isSystem;
          const person = userCache[id];
          const chip = agentAdmin
            ? agentMemberChip(id, agentAccessOf(id, { currentUserId, selfCanApprove, approverIds }))
            : null;
          const removable = canRemoveMember(conv, id, actor);
          const name = memberName(id, userCache);
          return (
            <View key={id} className="flex-row items-center gap-3 py-2.5" testID={`member-${id}`}>
              <ChatAvatar
                name={name}
                avatarUrl={isSystem ? null : person?.avatarUrl}
                size={44}
                online={!isSystem && (person?.online ?? false)}
                icon={isSystem ? systemConversationIcon(conv.systemKey) ?? 'robot-outline' : null}
              />
              <View className="flex-1">
                <Text variant="subtitle" numberOfLines={1}>
                  {name}
                  {id === currentUserId ? ` ${t('chat.members.you')}` : ''}
                </Text>
                {isSystem ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {agentAdmin ? t('chat.members.systemAgentAdmin') : t('chat.members.systemGeneric')}
                  </Text>
                ) : person?.email ? (
                  <Text variant="caption" tone="muted" numberOfLines={1}>{person.email}</Text>
                ) : null}
                {chip ? (
                  <View className="flex-row mt-1">
                    <Chip size="sm" label={chip.label} color={chip.color} />
                  </View>
                ) : null}
              </View>
              {removable ? (
                <Button size="sm" variant="ghost" action="error" disabled={busy} onPress={() => confirmRemove(id)}>
                  {t('chat.members.remove')}
                </Button>
              ) : null}
            </View>
          );
        })}
      </View>

      {canLeaveGroup(conv, currentUserId) ? (
        <Button
          variant="outline"
          action="error"
          icon="logout"
          onPress={confirmLeave}
          loading={busy}
          disabled={busy}
          fullWidth
          className="mt-6 mb-4"
        >
          {t('chat.members.leave')}
        </Button>
      ) : null}

      <AddMembersSheet
        visible={pickerOpen}
        participantIds={conv.participantIds}
        busy={busy}
        onClose={() => setPickerOpen(false)}
        onSubmit={handleAdd}
      />
    </Screen>
  );
}

// ----------------------------------------------------------------------

type AddMembersSheetProps = {
  visible: boolean;
  participantIds: string[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (ids: string[]) => void;
};

/** Chọn nhiều người trong danh bạ cửa hàng (chưa ở trong nhóm, bỏ Trợ lý hệ thống), tìm theo tên / email. */
function AddMembersSheet({ visible, participantIds, busy, onClose, onSubmit }: AddMembersSheetProps) {
  const userCache = useMessengerStore((s) => s.userCache);
  const setUserCache = useMessengerStore((s) => s.setUserCache);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Làm mới danh bạ mỗi lần mở (nhân viên mới vào cửa hàng sau khi app đã nạp danh bạ).
  useEffect(() => {
    if (!visible) return;
    setSearch('');
    setSelected([]);
    setRefreshing(true);
    fetchUsers()
      .then(setUserCache)
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [visible, setUserCache]);

  const all = useMemo(() => addableUsers(Object.values(userCache), participantIds), [userCache, participantIds]);
  const users = useMemo(
    () => addableUsers(Object.values(userCache), participantIds, search),
    [userCache, participantIds, search]
  );

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <Sheet
      visible={visible}
      title={t('chat.members.add')}
      onClose={onClose}
      footer={
        <Button
          icon="account-plus-outline"
          onPress={() => onSubmit(selected)}
          disabled={busy || selected.length === 0}
          loading={busy}
          fullWidth
        >
          {selected.length > 0 ? t('chat.members.addCount', { n: selected.length }) : t('chat.members.add')}
        </Button>
      }
    >
      <TextField
        icon="magnify"
        placeholder={t('chat.members.addSearch')}
        value={search}
        onChangeText={setSearch}
        containerClassName="mb-2"
      />
      {refreshing && all.length === 0 ? (
        <View className="py-8 items-center"><Spinner /></View>
      ) : users.length === 0 ? (
        <Text tone="muted" className="text-center py-8">
          {all.length === 0 ? t('chat.members.addEmpty') : t('chat.members.addNoMatch')}
        </Text>
      ) : (
        users.map((u) => {
          const on = selected.includes(u.id);
          return (
            <Pressable key={u.id} onPress={() => toggle(u.id)} className="flex-row items-center gap-3 py-2.5">
              <ChatAvatar name={u.fullName} avatarUrl={u.avatarUrl} size={40} online={u.online} />
              <View className="flex-1">
                <Text variant="subtitle" numberOfLines={1}>{u.fullName}</Text>
                {u.email ? <Text variant="caption" tone="muted" numberOfLines={1}>{u.email}</Text> : null}
              </View>
              <Icon
                name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={24}
                tone={on ? 'primary' : 'faint'}
              />
            </Pressable>
          );
        })
      )}
    </Sheet>
  );
}
