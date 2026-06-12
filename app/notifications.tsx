'use client';

import { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, TouchableOpacity } from 'react-native';
import {
  Text, useTheme, ActivityIndicator, Appbar, Surface, Snackbar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import dayjs from 'dayjs';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  type INotification,
} from 'src/api/notifications';
import { useNotificationHub } from 'src/hooks/use-notification-hub';
import { useNotificationSettings } from 'src/hooks/use-notification-settings';

dayjs.extend(isToday);
dayjs.extend(isYesterday);

// ----------------------------------------------------------------------

const TYPE_ICON: Record<string, { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; color: string }> = {
  Payroll:     { icon: 'cash-multiple',         color: '#22C55E' },
  Attendance:  { icon: 'fingerprint',            color: '#00A76F' },
  Shift:       { icon: 'calendar-clock',         color: '#00B8D9' },
  Leave:       { icon: 'calendar-remove-outline',color: '#FFAB00' },
  System:      { icon: 'cog-outline',            color: '#8E33FF' },
  default:     { icon: 'bell-outline',           color: '#637381' },
};

function getTypeInfo(type: string) {
  return TYPE_ICON[type] ?? TYPE_ICON.default;
}

function formatTime(iso: string) {
  const d = dayjs(iso);
  if (d.isToday()) return `Hôm nay ${d.format('HH:mm')}`;
  if (d.isYesterday()) return `Hôm qua ${d.format('HH:mm')}`;
  return d.format('DD/MM/YYYY HH:mm');
}

// ----------------------------------------------------------------------

function NotificationItem({
  item,
  onRead,
}: {
  item: INotification;
  onRead: (id: string) => void;
}) {
  const theme = useTheme();
  const typeInfo = getTypeInfo(item.type);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={() => {
        if (!item.isRead) onRead(item.id);
      }}
    >
      <Surface
        style={[
          styles.notifCard,
          {
            backgroundColor: item.isRead
              ? theme.colors.surface
              : `${theme.colors.primary}08`,
          },
        ]}
        elevation={item.isRead ? 0 : 1}
      >
        {/* Left icon */}
        <View
          style={[
            styles.iconBox,
            { backgroundColor: `${typeInfo.color}18` },
          ]}
        >
          <MaterialCommunityIcons
            name={typeInfo.icon}
            size={22}
            color={typeInfo.color}
          />
          {!item.isRead && (
            <View
              style={[styles.unreadDot, { backgroundColor: theme.colors.primary }]}
            />
          )}
        </View>

        {/* Content */}
        <View style={styles.notifBody}>
          <Text
            variant="bodyMedium"
            style={{
              fontWeight: item.isRead ? '400' : '700',
              color: theme.colors.onSurface,
              lineHeight: 20,
            }}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          {!!item.body && (
            <Text
              variant="bodySmall"
              style={{ color: '#637381', marginTop: 2 }}
              numberOfLines={2}
            >
              {item.body}
            </Text>
          )}
          <Text
            variant="labelSmall"
            style={{ color: '#9EA3AE', marginTop: 6 }}
          >
            {formatTime(item.createdAt)}
          </Text>
        </View>

        {/* Unread indicator bar */}
        {!item.isRead && (
          <View
            style={[
              styles.unreadBar,
              { backgroundColor: theme.colors.primary },
            ]}
          />
        )}
      </Surface>
    </TouchableOpacity>
  );
}

// ----------------------------------------------------------------------

export default function NotificationsScreen() {
  const theme = useTheme();
  const [notifications, setNotifications] = useState<INotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ visible: false, message: '' });
  const { prefs } = useNotificationSettings();

  const load = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications(
        data.sort((a, b) => dayjs(b.createdAt).diff(dayjs(a.createdAt)))
      );
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time: prepend new notification when SignalR fires (filtering + vibration handled by hook)
  useNotificationHub({
    preferences: prefs,
    onNewNotification: useCallback((n: INotification) => {
      setNotifications((prev) => {
        if (prev.some((p) => p.id === n.id)) return prev;
        return [n, ...prev];
      });
      setSnackbar({ visible: true, message: `${n.title}${n.body ? `\n${n.body}` : ''}` });
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
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch {}
  }, []);

  const handleReadAll = useCallback(async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {}
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <Appbar.Header
        style={{ backgroundColor: theme.colors.surface }}
        elevated
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title="Thông báo"
          titleStyle={{ fontWeight: 'bold', fontSize: 18 }}
        />
        {unreadCount > 0 && (
          <Appbar.Action
            icon="check-all"
            onPress={handleReadAll}
            accessibilityLabel="Đánh dấu tất cả đã đọc"
          />
        )}
      </Appbar.Header>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
          ListHeaderComponent={
            unreadCount > 0 ? (
              <View style={styles.unreadBanner}>
                <MaterialCommunityIcons
                  name="bell-badge-outline"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.primary, marginLeft: 6, fontWeight: '600' }}
                >
                  {unreadCount} thông báo chưa đọc · Nhấn để đánh dấu đã đọc
                </Text>
              </View>
            ) : (
              <View style={styles.allReadBanner}>
                <MaterialCommunityIcons name="check-all" size={16} color="#00A76F" />
                <Text
                  variant="labelMedium"
                  style={{ color: '#00A76F', marginLeft: 6 }}
                >
                  Tất cả đã đọc
                </Text>
              </View>
            )
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={{ fontSize: 48 }}>🔔</Text>
              <Text
                variant="bodyMedium"
                style={{ color: '#637381', marginTop: 12, fontWeight: '600' }}
              >
                Không có thông báo nào
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: '#9EA3AE', marginTop: 4, textAlign: 'center' }}
              >
                Khi có thông báo mới, chúng sẽ hiển thị ở đây
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <NotificationItem item={item} onRead={handleRead} />
          )}
        />
      )}

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={5000}
        style={styles.snackbar}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

// ----------------------------------------------------------------------

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 12, paddingBottom: 40 },

  notifCard: {
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    position: 'relative',
    flexShrink: 0,
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  notifBody: { flex: 1 },
  unreadBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },

  unreadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#00A76F10',
    padding: 10,
    borderRadius: 10,
  },
  allReadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#22C55E10',
    padding: 10,
    borderRadius: 10,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },

  snackbar: {
    marginBottom: 8,
  },
});
