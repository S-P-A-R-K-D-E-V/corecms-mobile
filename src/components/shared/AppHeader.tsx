import { View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../ui/text';
import { CountBadge } from '../ui/count-badge';
import { Pressable } from '../ui/pressable';
import { Icon, type IconName } from '../ui/icon';

export type HeaderAction = { icon: IconName; onPress: () => void; badge?: number };

export type AppHeaderProps = {
  title: string;
  subtitle?: string;
  back?: boolean;
  onBack?: () => void;
  actions?: HeaderAction[];
};

/** Quay lại; không còn lịch sử (vd mở thẳng từ thông báo) thì về trang chủ. */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Lightweight in-screen header (use when not relying on the native Stack header). */
export function AppHeader({ title, subtitle, back, onBack, actions }: AppHeaderProps) {
  return (
    <View className="flex-row items-center justify-between mb-1">
      <View className="flex-row items-center gap-2 flex-1">
        {back ? (
          <Pressable
            onPress={onBack ?? goBackOrHome}
            className="w-10 h-10 -ml-2 items-center justify-center rounded-full"
          >
            <Icon name="chevron-left" size={26} tone="default" />
          </Pressable>
        ) : null}
        <View className="flex-1">
          {subtitle ? <Text variant="bodySmall" tone="muted">{subtitle}</Text> : null}
          <Text variant="title" numberOfLines={1}>{title}</Text>
        </View>
      </View>
      <View className="flex-row items-center gap-1">
        {actions?.map((a, i) => (
          <Pressable
            key={i}
            onPress={a.onPress}
            className="w-10 h-10 items-center justify-center rounded-full bg-bg dark:bg-surface-dark"
          >
            <Icon name={a.icon} size={20} tone="default" />
            <CountBadge count={a.badge} style={{ position: 'absolute', top: 6, right: 6 }} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}
