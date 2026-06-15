import { View } from 'react-native';
import { router } from 'expo-router';
import { Text } from '../ui/text';
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

/** Lightweight in-screen header (use when not relying on the native Stack header). */
export function AppHeader({ title, subtitle, back, onBack, actions }: AppHeaderProps) {
  return (
    <View className="flex-row items-center justify-between mb-1">
      <View className="flex-row items-center gap-2 flex-1">
        {back ? (
          <Pressable
            onPress={onBack ?? (() => router.back())}
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
            {a.badge ? (
              <View className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-error items-center justify-center">
                <Text className="text-white text-[9px] font-bold">{a.badge > 99 ? '99+' : a.badge}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
