import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MotiView } from 'moti';

import { Text, Pressable, Icon } from 'src/components/ui';
import { useMessengerStore, type InAppNotif } from 'src/store/messenger-store';

const AUTO_DISMISS_MS = 4000;

function initialsOf(name: string) {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function NotifCard({ notif }: { notif: InAppNotif }) {
  const dismiss = useMessengerStore((s) => s.dismissInAppNotif);

  useEffect(() => {
    const remaining = AUTO_DISMISS_MS - (Date.now() - notif.at);
    const t = setTimeout(() => dismiss(notif.id), Math.max(remaining, 200));
    return () => clearTimeout(t);
  }, [notif.id, notif.at, dismiss]);

  function open() {
    dismiss(notif.id);
    router.push({ pathname: '/(tabs)/chat/[id]', params: { id: notif.convId, name: notif.name } });
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: -16 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -16 }}
      transition={{ type: 'timing', duration: 200 }}
    >
      <Pressable
        onPress={open}
        className="flex-row items-center gap-3 px-3.5 py-3 rounded-2xl bg-surface dark:bg-surface-dark border border-line/60 dark:border-line-dark"
        style={{ shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}
      >
        <View className="w-10 h-10 rounded-full bg-primary-50 items-center justify-center">
          <Text className="text-primary font-bold">{initialsOf(notif.name)}</Text>
        </View>
        <View className="flex-1">
          <Text variant="subtitle" numberOfLines={1}>{notif.title}</Text>
          <Text variant="bodySmall" tone="muted" numberOfLines={1}>{notif.preview}</Text>
        </View>
        <Pressable onPress={() => useMessengerStore.getState().dismissInAppNotif(notif.id)} className="w-7 h-7 items-center justify-center">
          <Icon name="close" size={16} tone="faint" />
        </Pressable>
      </Pressable>
    </MotiView>
  );
}

/** Toast thông báo tin nhắn hiển thị ngay trong app (khi đang ở màn Tin nhắn). */
export function InAppNotificationHost() {
  const insets = useSafeAreaInsets();
  const notifs = useMessengerStore((s) => s.inAppNotifs);

  if (notifs.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 6, left: 12, right: 12, gap: 8, zIndex: 1000 }}
    >
      {notifs.map((n) => (
        <NotifCard key={n.id} notif={n} />
      ))}
    </View>
  );
}
