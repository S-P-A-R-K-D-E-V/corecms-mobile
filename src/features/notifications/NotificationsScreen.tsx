import { useCallback, useEffect, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

import { AppHeader, EmptyState, Loading } from 'src/components/shared';
import { Text, Pressable, Icon, Appear, type IconName } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { brand } from 'src/theme';
import { getNotifications, markAsRead, markAllAsRead, deleteNotification, deleteAllNotifications, type INotification } from 'src/api/notifications';
import { useNotificationHub } from 'src/hooks/use-notification-hub';
import { useNotificationSettings } from 'src/hooks/use-notification-settings';
import { confirm, toast } from 'src/components/overlay';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

const TYPE_ICON: Record<string, { icon: IconName; color: string }> = {
  Payroll: { icon: 'cash-multiple', color: brand.success },
  Attendance: { icon: 'fingerprint', color: brand.primary },
  Shift: { icon: 'calendar-clock', color: brand.info },
  Leave: { icon: 'calendar-remove-outline', color: brand.warning },
  System: { icon: 'cog-outline', color: brand.secondary },
  default: { icon: 'bell-outline', color: brand.muted },
};

function formatTime(iso: string) {
  const d = dayjs(iso);
  if (d.isToday()) return `Hôm nay ${d.format('HH:mm')}`;
  if (d.isYesterday()) return `Hôm qua ${d.format('HH:mm')}`;
  return d.format('DD/MM/YYYY HH:mm');
}

function NotificationRow({ item, onRead, onDelete }: { item: INotification; onRead: (id: string) => void; onDelete: (id: string) => void }) {
  const ti = TYPE_ICON[item.type] ?? TYPE_ICON.default;
  return (
    <Pressable
      onPress={() => { if (!item.isRead) onRead(item.id); }}
      className={cn(
        'flex-row items-start gap-3 p-3.5 rounded-2xl border',
        item.isRead ? 'bg-surface dark:bg-surface-dark border-line/50 dark:border-line-dark' : 'bg-primary-50 border-primary/20'
      )}
    >
      <View className="w-11 h-11 rounded-xl items-center justify-center" style={{ backgroundColor: `${ti.color}1A` }}>
        <Icon name={ti.icon} size={22} color={ti.color} />
      </View>
      <View className="flex-1">
        <Text variant="body" className={item.isRead ? '' : 'font-bold'} numberOfLines={2}>{item.title}</Text>
        {item.body ? <Text variant="bodySmall" tone="muted" numberOfLines={2} className="mt-0.5">{item.body}</Text> : null}
        <Text variant="caption" tone="faint" className="mt-1.5">{formatTime(item.createdAt)}</Text>
      </View>
      {!item.isRead ? <View className="w-2.5 h-2.5 rounded-full bg-primary mt-1" /> : null}
      <Pressable hitSlop={8} onPress={() => onDelete(item.id)} className="w-8 h-8 items-center justify-center -mr-1 -mt-1">
        <Icon name="trash-can-outline" size={18} tone="faint" />
      </Pressable>
    </Pressable>
  );
}

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<INotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { prefs } = useNotificationSettings();

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setItems(data.sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt))));
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useNotificationHub({
    preferences: prefs,
    onNewNotification: useCallback((n: INotification) => {
      setItems((prev) => (prev.some((p) => p.id === n.id) ? prev : [n, ...prev]));
    }, []),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleRead = useCallback(async (id: string) => {
    try {
      await markAsRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    } catch {}
  }, []);

  const handleReadAll = useCallback(async () => {
    try {
      await markAllAsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    const prev = items;
    setItems((cur) => cur.filter((n) => n.id !== id)); // optimistic
    try {
      await deleteNotification(id);
    } catch {
      setItems(prev); // rollback
      toast.error('Không xoá được thông báo');
    }
  }, [items]);

  const handleDeleteAll = useCallback(async () => {
    if (items.length === 0) return;
    const ok = await confirm({
      title: 'Xoá tất cả thông báo?',
      message: `Sẽ xoá ${items.length} thông báo. Hành động không thể hoàn tác.`,
      confirmText: 'Xoá tất cả',
      destructive: true,
    });
    if (!ok) return;
    const prev = items;
    const ids = items.map((n) => n.id);
    setItems([]); // optimistic
    try {
      await deleteAllNotifications(ids);
    } catch {
      setItems(prev);
      toast.error('Xoá tất cả thất bại');
    }
  }, [items]);

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <View className="flex-1 bg-bg dark:bg-bg-dark" style={{ paddingTop: insets.top }}>
      <View className="px-4 pt-2">
        <AppHeader
          title="Thông báo"
          back
          actions={[
            ...(unread > 0 ? [{ icon: 'check-all' as IconName, onPress: handleReadAll }] : []),
            ...(items.length > 0 ? [{ icon: 'trash-can-outline' as IconName, onPress: handleDeleteAll }] : []),
          ]}
        />
      </View>
      {loading ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerClassName="px-4 pb-10 gap-2"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[brand.primary]} tintColor={brand.primary} />}
          ListHeaderComponent={
            <View className={cn('flex-row items-center gap-1.5 rounded-xl p-2.5 mb-1', unread > 0 ? 'bg-primary-50' : 'bg-success-soft')}>
              <Icon name={unread > 0 ? 'bell-badge-outline' : 'check-all'} size={16} tone={unread > 0 ? 'primary' : 'success'} />
              <Text variant="caption" tone={unread > 0 ? 'primary' : 'success'} className="font-semibold">
                {unread > 0 ? `${unread} thông báo chưa đọc · Nhấn để đánh dấu đã đọc` : 'Tất cả đã đọc'}
              </Text>
            </View>
          }
          ListEmptyComponent={<EmptyState icon="bell-outline" title="Không có thông báo nào" description="Khi có thông báo mới, chúng sẽ hiển thị ở đây" />}
          renderItem={({ item, index }) => (
            <Appear index={Math.min(index, 8)}>
              <NotificationRow item={item} onRead={handleRead} onDelete={handleDelete} />
            </Appear>
          )}
        />
      )}
    </View>
  );
}
