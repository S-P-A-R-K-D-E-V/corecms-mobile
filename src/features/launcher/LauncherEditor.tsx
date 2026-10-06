import { useMemo } from 'react';
import { View } from 'react-native';

import { Sheet } from 'src/components/shared';
import { Button, Text, Icon, Pressable, Divider } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';

import {
  availableFeatures,
  getFeature,
  groupLabel,
  featureLabel,
  type FeatureItem,
  type LauncherGroup,
  type LauncherVariant,
  MAX_PINS,
} from './registry';
import { useLauncherStore } from './store';
import { useFeatureContext } from './feature-context';
import { t } from 'src/i18n';

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
        <Text variant="bodySmall" className="font-medium">{featureLabel(item)}</Text>
        <Text variant="caption" tone="muted" className="text-[10px]">
          {groupLabel(item.group)}{item.comingSoon ? ` · ${t('launcher.comingSoon')}` : ''}
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

  const ctx = useFeatureContext();
  const available = useMemo(() => availableFeatures(user, ctx), [user, ctx]);
  const allowedKeys = useMemo(() => new Set(available.map((f) => f.key)), [available]);

  // Ghim hợp lệ (giữ thứ tự, tối đa MAX_PINS) + nhóm "có thể thêm" theo group.
  const cleanPins = () => pinKeys.filter((k) => allowedKeys.has(k)).slice(0, MAX_PINS);
  const pinned = useMemo(
    () => pinKeys.filter((k) => allowedKeys.has(k)).slice(0, MAX_PINS).map((k) => getFeature(k)!).filter(Boolean),
    [pinKeys, allowedKeys]
  );
  const full = pinned.length >= MAX_PINS;
  const unpinnedByGroup = useMemo(() => {
    const pinnedSet = new Set(pinned.map((f) => f.key));
    const groups: Record<LauncherGroup, FeatureItem[]> = { sales: [], personal: [], manage: [], admin: [] };
    for (const f of available) if (!pinnedSet.has(f.key)) groups[f.group].push(f);
    return groups;
  }, [available, pinned]);

  function pin(key: string) {
    if (full) {
      haptics.warning();
      toast.info(t('launcher.pinLimit', { max: MAX_PINS }));
      return;
    }
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

  const groupOrder: LauncherGroup[] = ['sales', 'personal', 'manage', 'admin'];

  return (
    <Sheet
      visible={visible}
      title="Tùy chỉnh tiện ích"
      onClose={onClose}
      footer={
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button variant="ghost" onPress={() => reset(variant)}>
              Khôi phục mặc định
            </Button>
          </View>
          <View className="flex-1">
            <Button onPress={onClose}>Xong</Button>
          </View>
        </View>
      }
    >
      {/* Đang hiển thị — kéo thứ tự bằng nút lên/xuống */}
      <View className="flex-row items-center justify-between mb-1">
        <Text variant="label" tone="muted">{t('launcher.pinned', { n: pinned.length, max: MAX_PINS }).toUpperCase()}</Text>
        <Text variant="caption" tone={full ? 'warning' : 'faint'}>{t('launcher.quickSubtitle', { max: MAX_PINS })}</Text>
      </View>
      {pinned.length === 0 ? (
        <Text variant="bodySmall" tone="muted" className="py-2">{t('launcher.emptyPinnedShort')}</Text>
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
            <Text variant="label" tone="muted" className="mb-1">{groupLabel(g).toUpperCase()}</Text>
            {unpinnedByGroup[g].map((item) => (
              <Row key={item.key} item={item}>
                <Pressable onPress={() => pin(item.key)} hitSlop={6} className={cn('w-8 h-8 items-center justify-center rounded-lg bg-primary-soft', full && 'opacity-35')}>
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
