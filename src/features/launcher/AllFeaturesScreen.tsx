import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Screen, AppHeader } from 'src/components/shared';
import { Card, Text, Icon, Pressable } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';
import { usesAdminShell } from 'src/auth/roles';

import {
  availableFeatures,
  featureLabel,
  groupLabel,
  visiblePins,
  MAX_PINS,
  type FeatureItem,
  type FeatureTone,
  type LauncherGroup,
} from './registry';
import { useLauncherStore } from './store';
import { FeatureGrid } from './FeatureGrid';
import { t } from 'src/i18n';

// ----------------------------------------------------------------------
// Tab "Tiện ích" (như trang Tiện ích của MB Bank): trên cùng là "Dùng nhanh" — các mục đang ghim ra
// trang chủ (tối đa 8, "Đã ghim x/8"); dưới là TOÀN BỘ tiện ích user được phép theo nhóm, mỗi dòng có
// nút ghim/bỏ ghim.
// ----------------------------------------------------------------------

const GROUP_ICON: Record<LauncherGroup, string> = {
  sales: 'storefront-outline',
  personal: 'account-outline',
  manage: 'account-group-outline',
  admin: 'shield-crown-outline',
};

const TONE_BG: Record<FeatureTone, string> = {
  primary: 'bg-primary-soft',
  info: 'bg-info-soft',
  success: 'bg-success-soft',
  warning: 'bg-warning-soft',
  secondary: 'bg-secondary-soft',
};

function FeatureRow({
  item,
  pinned,
  canPin,
  onTogglePin,
}: {
  item: FeatureItem;
  pinned: boolean;
  canPin: boolean;
  onTogglePin: () => void;
}) {
  const disabled = !!item.comingSoon;
  const tone = item.tone ?? 'primary';
  return (
    <View className={cn('flex-row items-center gap-3 py-2', disabled && 'opacity-45')}>
      <Pressable
        onPress={() => {
          if (disabled) { toast.info(t('launcher.comingSoonToast'), t('launcher.comingSoonTitle')); return; }
          haptics.light();
          router.push(item.href as any);
        }}
        className="flex-1 flex-row items-center gap-3"
      >
        <View className={cn('w-10 h-10 rounded-xl items-center justify-center', TONE_BG[tone])}>
          <Icon name={item.icon} size={20} tone={tone} />
        </View>
        <Text variant="bodySmall" className="flex-1 font-medium">{featureLabel(item)}</Text>
        {disabled ? (
          <View className="rounded-full px-2 py-0.5 bg-warning-soft">
            <Text className="text-[9px] text-warning-text font-bold">{t('launcher.comingSoon')}</Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onTogglePin}
        hitSlop={8}
        accessibilityLabel={pinned ? t('launcher.unpin') : t('launcher.pin')}
        className={cn(
          'w-9 h-9 rounded-full items-center justify-center',
          pinned ? 'bg-primary-soft' : 'bg-ink/5 dark:bg-white/10',
          !pinned && !canPin && 'opacity-35'
        )}
      >
        <Icon name={pinned ? 'pin' : 'pin-outline'} size={18} tone={pinned ? 'primary' : 'faint'} />
      </Pressable>
    </View>
  );
}

export function AllFeaturesScreen() {
  const { user } = useAuthContext();
  const variant = usesAdminShell(user) ? 'admin' : 'staff';
  const pinKeys = useLauncherStore((s) => s.pins[variant]);
  const setPins = useLauncherStore((s) => s.setPins);

  const pinned = useMemo(() => visiblePins(pinKeys, user), [pinKeys, user]);
  const pinnedKeys = useMemo(() => new Set(pinned.map((f) => f.key)), [pinned]);
  const full = pinned.length >= MAX_PINS;

  const groups = useMemo(() => {
    const all = availableFeatures(user);
    const order: LauncherGroup[] = ['sales', 'personal', 'manage', 'admin'];
    return order
      .map((g) => ({ group: g, items: all.filter((f) => f.group === g) }))
      .filter((x) => x.items.length > 0);
  }, [user]);

  function togglePin(key: string) {
    const current = pinned.map((f) => f.key);
    if (pinnedKeys.has(key)) {
      haptics.light();
      setPins(variant, current.filter((k) => k !== key));
      return;
    }
    if (full) {
      haptics.warning();
      toast.info(t('launcher.pinLimit', { max: MAX_PINS }));
      return;
    }
    haptics.light();
    setPins(variant, [...current, key]);
  }

  return (
    <Screen scroll>
      <AppHeader title={t('launcher.title')} subtitle={t('launcher.allSubtitle')} />

      <FeatureGrid variant={variant} title={t('home.quickActions')} />
      <View className="flex-row items-center gap-1.5 -mt-1 px-1">
        <Icon name="pin-outline" size={14} tone={full ? 'warning' : 'muted'} />
        <Text variant="caption" tone={full ? 'warning' : 'muted'} className="font-semibold">
          {t('launcher.pinned', { n: pinned.length, max: MAX_PINS })}
        </Text>
        <Text variant="caption" tone="faint" className="flex-1" numberOfLines={1}>
          · {t('launcher.quickSubtitle', { max: MAX_PINS })}
        </Text>
      </View>

      {groups.map(({ group, items }) => (
        <Card key={group} className="px-4 pt-3.5 pb-2">
          <View className="flex-row items-center gap-2 mb-1">
            <Icon name={GROUP_ICON[group] as any} size={18} tone="primary" />
            <Text variant="subtitle" className="flex-1">{groupLabel(group)}</Text>
            <Text variant="caption" tone="muted">{items.length}</Text>
          </View>
          {items.map((item) => (
            <FeatureRow
              key={item.key}
              item={item}
              pinned={pinnedKeys.has(item.key)}
              canPin={!full}
              onTogglePin={() => togglePin(item.key)}
            />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
