import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Screen, AppHeader } from 'src/components/shared';
import { Card, Text, Icon, Pressable } from 'src/components/ui';
import { cn } from 'src/components/ui/utils';
import { haptics } from 'src/services/haptics';
import { toast } from 'src/components/overlay';
import { useAuthContext } from 'src/auth/auth-context';

import { availableFeatures, GROUP_LABELS, type FeatureItem, type LauncherGroup } from './registry';

// ----------------------------------------------------------------------
// Danh sách TOÀN BỘ tiện ích user được phép, phân theo loại (Cá nhân / Quản
// lý / Quản trị). Tab "Tiện ích" của Admin. Không phụ thuộc ghim — hiện hết.
// ----------------------------------------------------------------------

const GROUP_ICON: Record<LauncherGroup, string> = {
  personal: 'account-outline',
  manage: 'account-group-outline',
  admin: 'shield-crown-outline',
};

function FeatureRow({ item }: { item: FeatureItem }) {
  const disabled = !!item.comingSoon;
  return (
    <Pressable
      onPress={() => {
        if (disabled) { toast.info('Tính năng đang được phát triển.', 'Sắp có'); return; }
        haptics.light();
        router.push(item.href as any);
      }}
      className={cn('flex-row items-center gap-3 py-2.5', disabled && 'opacity-45')}
    >
      <View className="w-10 h-10 rounded-xl bg-primary-soft items-center justify-center">
        <Icon name={item.icon} size={20} tone="primary" />
      </View>
      <Text variant="bodySmall" className="flex-1 font-medium">{item.label}</Text>
      {disabled ? (
        <View className="rounded-full px-2 py-0.5 bg-warning-soft">
          <Text className="text-[9px] text-warning-text font-bold">Đang phát triển</Text>
        </View>
      ) : (
        <Icon name="chevron-right" size={18} tone="faint" />
      )}
    </Pressable>
  );
}

export function AllFeaturesScreen() {
  const { user } = useAuthContext();

  const groups = useMemo(() => {
    const all = availableFeatures(user);
    const order: LauncherGroup[] = ['admin', 'manage', 'personal'];
    return order
      .map((g) => ({ group: g, items: all.filter((f) => f.group === g) }))
      .filter((x) => x.items.length > 0);
  }, [user]);

  return (
    <Screen scroll>
      <AppHeader title="Tiện ích" subtitle="Tất cả tính năng theo nhóm" />
      {groups.map(({ group, items }) => (
        <Card key={group} className="p-4">
          <View className="flex-row items-center gap-2 mb-1">
            <Icon name={GROUP_ICON[group] as any} size={18} tone="primary" />
            <Text variant="subtitle" className="flex-1">{GROUP_LABELS[group]}</Text>
            <Text variant="caption" tone="muted">{items.length}</Text>
          </View>
          {items.map((item) => (
            <FeatureRow key={item.key} item={item} />
          ))}
        </Card>
      ))}
    </Screen>
  );
}
