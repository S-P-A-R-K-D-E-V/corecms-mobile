import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { SectionCard } from 'src/components/shared';
import { Text, Icon, Pressable } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';

import { availableFeatures, getFeature, type FeatureItem, type LauncherVariant } from './registry';
import { useLauncherStore } from './store';
import { LauncherEditor } from './LauncherEditor';

// ----------------------------------------------------------------------

function FeatureTile({ item }: { item: FeatureItem }) {
  // Tính năng đang phát triển: nút vẫn hiển thị nhưng DISABLED — không điều
  // hướng (tránh lỗi route chưa tồn tại), chỉ mờ đi + tag "Đang phát triển".
  const disabled = !!item.comingSoon;

  function onPress() {
    haptics.light();
    router.push(item.href as any);
  }

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={{ width: '25%' }}
      className={cn('items-center gap-1.5 py-2', disabled && 'opacity-45')}
    >
      <View className="w-[52px] h-[52px] rounded-2xl bg-primary-soft items-center justify-center relative">
        <Icon name={item.icon} size={26} tone={disabled ? 'faint' : 'primary'} />
      </View>
      {disabled ? (
        <View className="rounded-full px-1.5 py-px bg-warning-soft -mt-0.5">
          <Text className="text-[8px] text-warning-text font-bold">Đang phát triển</Text>
        </View>
      ) : null}
      <Text variant="caption" numberOfLines={2} className="text-center text-[11px] leading-[13px]">
        {item.label}
      </Text>
    </Pressable>
  );
}

export function FeatureGrid({ variant }: { variant: LauncherVariant }) {
  const { user } = useAuthContext();
  const [editing, setEditing] = useState(false);
  const pinKeys = useLauncherStore((s) => s.pins[variant]);

  // Chỉ hiện tiện ích user được phép (lọc role) và đang ghim, giữ đúng thứ tự ghim.
  const pinned = useMemo(() => {
    const allowed = new Set(availableFeatures(user).map((f) => f.key));
    return pinKeys
      .filter((k) => allowed.has(k))
      .map((k) => getFeature(k))
      .filter((f): f is FeatureItem => !!f);
  }, [pinKeys, user]);

  return (
    <>
      <SectionCard
        title="Tiện ích"
        icon="apps"
        right={
          <Pressable
            onPress={() => setEditing(true)}
            hitSlop={8}
            className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-primary-soft"
          >
            <Icon name="tune-variant" size={14} tone="primary" />
            <Text variant="caption" className="text-primary font-semibold">Tùy chỉnh</Text>
          </Pressable>
        }
      >
        {pinned.length === 0 ? (
          <Pressable onPress={() => setEditing(true)} className="items-center py-4 gap-1">
            <Icon name="apps" size={28} tone="faint" />
            <Text variant="bodySmall" tone="muted">Chưa ghim tiện ích nào — nhấn để thêm</Text>
          </Pressable>
        ) : (
          <View className="flex-row flex-wrap">
            {pinned.map((item) => (
              <FeatureTile key={item.key} item={item} />
            ))}
          </View>
        )}
      </SectionCard>

      <LauncherEditor variant={variant} visible={editing} onClose={() => setEditing(false)} />
    </>
  );
}
