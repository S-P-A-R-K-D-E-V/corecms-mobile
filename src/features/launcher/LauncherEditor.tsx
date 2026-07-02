import { useMemo } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Button, Text, Icon, Pressable, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import { useAuthContext } from 'src/auth/auth-context';

import {
  availableFeatures,
  getFeature,
  GROUP_LABELS,
  type FeatureItem,
  type LauncherGroup,
  type LauncherVariant,
} from './registry';
import { useLauncherStore } from './store';

// ----------------------------------------------------------------------
// Màn tùy chỉnh "menu ưu tiên": ghim/bỏ ghim tiện ích và sắp thứ tự (lên/xuống).
// Dùng chung cho nút "Tùy chỉnh" ở góc grid và mục trong Cài đặt.
// ----------------------------------------------------------------------

function Row({
  item,
  children,
}: {
  item: FeatureItem;
  children: React.ReactNode;
}) {
  return (
    <View className={cn('flex-row items-center gap-3 py-2.5', item.comingSoon && 'opacity-60')}>
      <View className="w-9 h-9 rounded-xl bg-primary-soft items-center justify-center">
        <Icon name={item.icon} size={18} tone="primary" />
      </View>
      <View className="flex-1">
        <Text variant="bodySmall" className="font-medium">{item.label}</Text>
        <Text variant="caption" tone="muted" className="text-[10px]">
          {GROUP_LABELS[item.group]}{item.comingSoon ? ' · Sắp có' : ''}
        </Text>
      </View>
      {children}
    </View>
  );
}

export function LauncherEditor({
  variant,
  visible,
  onClose,
}: {
  variant: LauncherVariant;
  visible: boolean;
  onClose: () => void;
}) {
  const { user } = useAuthContext();
  const pinKeys = useLauncherStore((s) => s.pins[variant]);
  const setPins = useLauncherStore((s) => s.setPins);
  const reset = useLauncherStore((s) => s.reset);

  const available = useMemo(() => availableFeatures(user), [user]);
  const allowedKeys = useMemo(() => new Set(available.map((f) => f.key)), [available]);

  // Ghim hợp lệ (giữ thứ tự) + nhóm "có thể thêm" theo group.
  const pinned = useMemo(
    () => pinKeys.filter((k) => allowedKeys.has(k)).map((k) => getFeature(k)!).filter(Boolean),
    [pinKeys, allowedKeys]
  );
  const unpinnedByGroup = useMemo(() => {
    const pinnedSet = new Set(pinKeys);
    const groups: Record<LauncherGroup, FeatureItem[]> = { personal: [], manage: [], admin: [] };
    for (const f of available) if (!pinnedSet.has(f.key)) groups[f.group].push(f);
    return groups;
  }, [available, pinKeys]);

  const cleanPins = () => pinKeys.filter((k) => allowedKeys.has(k));

  function pin(key: string) {
    haptics.light();
    setPins(variant, [...cleanPins(), key]);
  }
  function unpin(key: string) {
    haptics.light();
    setPins(variant, cleanPins().filter((k) => k !== key));
  }
  function move(key: string, dir: -1 | 1) {
    const keys = cleanPins();
    const i = keys.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= keys.length) return;
    haptics.selection();
    [keys[i], keys[j]] = [keys[j], keys[i]];
    setPins(variant, keys);
  }

  const groupOrder: LauncherGroup[] = ['personal', 'manage', 'admin'];

  return (
    <Sheet
      visible={visible}
      title="Tùy chỉnh tiện ích"
      onClose={onClose}
      footer={
        <View className="flex-row gap-2">
          <Button variant="ghost" className="flex-1" onPress={() => reset(variant)}>
            Khôi phục mặc định
          </Button>
          <Button className="flex-1" onPress={onClose}>Xong</Button>
        </View>
      }
    >
      {/* Đang hiển thị — kéo thứ tự bằng nút lên/xuống */}
      <Text variant="label" tone="muted" className="mb-1">ĐANG HIỂN THỊ ({pinned.length})</Text>
      {pinned.length === 0 ? (
        <Text variant="bodySmall" tone="muted" className="py-2">Chưa ghim tiện ích nào.</Text>
      ) : (
        pinned.map((item, idx) => (
          <Row key={item.key} item={item}>
            <View className="flex-row items-center gap-1">
              <Pressable onPress={() => move(item.key, -1)} hitSlop={6} disabled={idx === 0} className={cn('w-8 h-8 items-center justify-center rounded-lg bg-ink/5 dark:bg-white/10', idx === 0 && 'opacity-30')}>
                <Icon name="chevron-up" size={18} tone="muted" />
              </Pressable>
              <Pressable onPress={() => move(item.key, 1)} hitSlop={6} disabled={idx === pinned.length - 1} className={cn('w-8 h-8 items-center justify-center rounded-lg bg-ink/5 dark:bg-white/10', idx === pinned.length - 1 && 'opacity-30')}>
                <Icon name="chevron-down" size={18} tone="muted" />
              </Pressable>
              <Pressable onPress={() => unpin(item.key)} hitSlop={6} className="w-8 h-8 items-center justify-center rounded-lg bg-error-soft">
                <Icon name="minus" size={18} tone="error" />
              </Pressable>
            </View>
          </Row>
        ))
      )}

      {/* Có thể thêm — nhóm theo Cá nhân / Quản lý / Quản trị */}
      {groupOrder.map((g) =>
        unpinnedByGroup[g].length > 0 ? (
          <View key={g} className="mt-3">
            <Divider className="mb-2" />
            <Text variant="label" tone="muted" className="mb-1">{GROUP_LABELS[g].toUpperCase()}</Text>
            {unpinnedByGroup[g].map((item) => (
              <Row key={item.key} item={item}>
                <Pressable onPress={() => pin(item.key)} hitSlop={6} className="w-8 h-8 items-center justify-center rounded-lg bg-primary-soft">
                  <Icon name="plus" size={18} tone="primary" />
                </Pressable>
              </Row>
            ))}
          </View>
        ) : null
      )}
    </Sheet>
  );
}
